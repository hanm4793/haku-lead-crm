import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { drizzle } from "drizzle-orm/postgres-js";
import { eq, inArray } from "drizzle-orm";
import postgres from "postgres";

import {
  ASSIGNEES,
  DEFAULT_BRAND_SEED,
  DEFAULT_CATALOG_LABELS,
  DEFAULT_PROJECT_NAME,
  DEFAULT_PROJECT_SLUG,
  LOCATIONS,
  PRODUCTS_BY_BRAND,
} from "../src/lib/constants";
import * as schema from "../src/lib/db/schema";
import { generateDemoData } from "../src/lib/mock-data";

const seedDemoLeads =
  process.env.SEED_DEMO_LEADS === "1" || process.argv.includes("--demo");

const CHUNK = 500;

function chunked<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

type Db = ReturnType<typeof drizzle>;

type CatalogMaps = {
  projectId: string;
  brandIdByCode: Map<string, string>;
  locationIdByName: Map<string, string>;
  userIdByName: Map<string, string>;
  productIdByKey: Map<string, string>;
};

/** Project mặc định (một project ở Phase B) — tạo nếu chưa có. */
async function ensureProject(db: Db): Promise<string> {
  await db
    .insert(schema.projects)
    .values({
      slug: DEFAULT_PROJECT_SLUG,
      name: DEFAULT_PROJECT_NAME,
      brandLabel: DEFAULT_CATALOG_LABELS.brand,
      productLabel: DEFAULT_CATALOG_LABELS.product,
      locationLabel: DEFAULT_CATALOG_LABELS.location,
    })
    .onConflictDoNothing({ target: schema.projects.slug });
  const [project] = await db
    .select({ id: schema.projects.id })
    .from(schema.projects)
    .where(eq(schema.projects.slug, DEFAULT_PROJECT_SLUG));
  if (!project) throw new Error("Không tạo được project mặc định.");
  return project.id;
}

/** Brand → product → location theo project; idempotent nhờ unique key. */
async function ensureDimensionCatalogs(
  db: Db,
  projectId: string,
): Promise<Pick<CatalogMaps, "brandIdByCode" | "locationIdByName" | "productIdByKey">> {
  await db
    .insert(schema.brands)
    .values(DEFAULT_BRAND_SEED.map((b, i) => ({ projectId, code: b.code, name: b.name, sortOrder: i })))
    .onConflictDoNothing({ target: [schema.brands.projectId, schema.brands.code] });
  const brandRows = await db
    .select({ id: schema.brands.id, code: schema.brands.code })
    .from(schema.brands)
    .where(eq(schema.brands.projectId, projectId));
  const brandIdByCode = new Map(brandRows.map((r) => [r.code, r.id]));

  const productValues = Object.entries(PRODUCTS_BY_BRAND).flatMap(([code, names]) => {
    const brandId = brandIdByCode.get(code);
    if (!brandId) return [];
    return names.map((name) => ({ projectId, brandId, name }));
  });
  if (productValues.length) {
    await db
      .insert(schema.products)
      .values(productValues)
      .onConflictDoNothing({ target: [schema.products.brandId, schema.products.name] });
  }
  const productRows = await db
    .select({ id: schema.products.id, brandId: schema.products.brandId, name: schema.products.name })
    .from(schema.products)
    .where(eq(schema.products.projectId, projectId));
  const codeByBrandId = new Map(brandRows.map((r) => [r.id, r.code]));
  const productIdByKey = new Map(
    productRows.map((r) => [`${codeByBrandId.get(r.brandId) ?? ""}|${r.name}`, r.id]),
  );

  await db
    .insert(schema.locations)
    .values(LOCATIONS.map((name, i) => ({ projectId, name, sortOrder: i })))
    .onConflictDoNothing({ target: [schema.locations.projectId, schema.locations.name] });
  const locationRows = await db
    .select({ id: schema.locations.id, name: schema.locations.name })
    .from(schema.locations)
    .where(eq(schema.locations.projectId, projectId));

  return {
    brandIdByCode,
    locationIdByName: new Map(locationRows.map((r) => [r.name, r.id])),
    productIdByKey,
  };
}

async function ensureUsers(db: Db): Promise<Map<string, string>> {
  const existingUsers = await db
    .select({ id: schema.appUsers.id, fullName: schema.appUsers.fullName })
    .from(schema.appUsers)
    .where(inArray(schema.appUsers.fullName, [...ASSIGNEES]));
  const userIdByName = new Map(existingUsers.map((r) => [r.fullName, r.id]));

  const missingAssignees = ASSIGNEES.filter((name) => !userIdByName.has(name));
  if (missingAssignees.length) {
    const inserted = await db
      .insert(schema.appUsers)
      .values(
        missingAssignees.map((fullName) => ({
          fullName,
          role: fullName === ASSIGNEES[0] ? ("SUPER_ADMIN" as const) : ("STAFF" as const),
        })),
      )
      .returning({ id: schema.appUsers.id, fullName: schema.appUsers.fullName });
    for (const row of inserted) userIdByName.set(row.fullName, row.id);
  }
  return userIdByName;
}

/** Bổ sung danh mục thiếu — không xóa lead hay hàng tham chiếu đang được lead trỏ tới. */
async function ensureCatalogs(db: Db): Promise<CatalogMaps> {
  const projectId = await ensureProject(db);
  const dimensions = await ensureDimensionCatalogs(db, projectId);
  const userIdByName = await ensureUsers(db);
  return { projectId, ...dimensions, userIdByName };
}

/** Xóa sạch và nạp lại danh mục (chế độ demo — sẽ xóa lead trước). */
async function replaceCatalogs(db: Db): Promise<CatalogMaps> {
  await db.delete(schema.appUsers);
  await db.delete(schema.products);
  await db.delete(schema.brands);
  await db.delete(schema.locations);

  const projectId = await ensureProject(db);
  const dimensions = await ensureDimensionCatalogs(db, projectId);

  const userRows = await db
    .insert(schema.appUsers)
    .values(
      ASSIGNEES.map((fullName, i) => ({
        fullName,
        role: i === 0 ? ("SUPER_ADMIN" as const) : ("STAFF" as const),
      })),
    )
    .returning({ id: schema.appUsers.id, fullName: schema.appUsers.fullName });
  const userIdByName = new Map(userRows.map((r) => [r.fullName, r.id]));

  return { projectId, ...dimensions, userIdByName };
}

function describe(maps: CatalogMaps) {
  return `  ${maps.brandIdByCode.size} ${DEFAULT_CATALOG_LABELS.brand.toLowerCase()} · ${maps.productIdByKey.size} ${DEFAULT_CATALOG_LABELS.product.toLowerCase()} · ${maps.locationIdByName.size} ${DEFAULT_CATALOG_LABELS.location.toLowerCase()} · ${maps.userIdByName.size} nhân sự`;
}

async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Thiếu DIRECT_URL (hoặc DATABASE_URL) trong .env.local.");
  }

  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  if (!seedDemoLeads) {
    console.log("Bổ sung danh mục (giữ nguyên lead và lịch sử hoạt động)…");
    const maps = await ensureCatalogs(db);
    console.log(`${describe(maps)} (trong DB)`);
    await sql.end();
    console.log("Xong. Không nạp lead demo — dùng pnpm db:seed:demo chỉ trên DB dev trống.");
    return;
  }

  console.log("Xóa dữ liệu cũ (lead + danh mục)…");
  await db.delete(schema.activityLogs);
  await db.delete(schema.leads);

  console.log("Nạp lại danh mục tham chiếu…");
  const maps = await replaceCatalogs(db);
  const { projectId, brandIdByCode, locationIdByName, userIdByName, productIdByKey } = maps;
  console.log(describe(maps));

  console.log("Sinh dữ liệu demo…");
  const { leads, logsByLead } = generateDemoData(new Date());

  const mockIdToDbId = new Map(leads.map((lead) => [lead.id, randomUUID()]));

  const leadValues = leads.map((lead) => {
    const locationId = lead.location ? locationIdByName.get(lead.location) : undefined;
    const brandId = lead.brand ? brandIdByCode.get(lead.brand) : undefined;
    if (!locationId || !brandId) {
      throw new Error(
        `Không map được ${DEFAULT_CATALOG_LABELS.location}/${DEFAULT_CATALOG_LABELS.brand} cho lead ${lead.id}`,
      );
    }

    return {
      id: mockIdToDbId.get(lead.id)!,
      createdAt: new Date(lead.createdAt),
      updatedAt: new Date(lead.createdAt),
      name: lead.name,
      phone: lead.phone,
      contactStatus: lead.contactStatus,
      category: lead.category,
      failReason: lead.failReason,
      source: lead.source,
      channelDetail: lead.channelDetail,
      projectId,
      brandId,
      locationId,
      assigneeId: lead.assignee ? (userIdByName.get(lead.assignee) ?? null) : null,
      productId: lead.product ? (productIdByKey.get(`${lead.brand}|${lead.product}`) ?? null) : null,
      attrs: lead.attrs ?? {},
      careNote: lead.careNote,
      callbackAt: lead.callbackAt ? new Date(lead.callbackAt) : null,
      contactCount: lead.contactCount,
      lastContactAt: lead.lastContactAt ? new Date(lead.lastContactAt) : null,
      campaign: lead.campaign,
      adContent: lead.adContent,
      costPerLead: lead.costPerLead,
    };
  });

  console.log(`Nạp ${leadValues.length} lead…`);
  for (const batch of chunked(leadValues)) {
    await db.insert(schema.leads).values(batch);
  }

  const logValues = [...logsByLead.entries()].flatMap(([mockLeadId, logs]) => {
    const leadId = mockIdToDbId.get(mockLeadId);
    if (!leadId) return [];
    return logs.map((log) => ({
      leadId,
      kind: log.kind,
      message: log.message,
      at: new Date(log.at),
      actorId: userIdByName.get(log.actor) ?? null,
      actorName: log.actor,
      byAi: log.byAi ?? false,
    }));
  });

  console.log(`Nạp ${logValues.length} dòng lịch sử hoạt động…`);
  for (const batch of chunked(logValues)) {
    await db.insert(schema.activityLogs).values(batch);
  }

  await sql.end();
  console.log("Xong.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
