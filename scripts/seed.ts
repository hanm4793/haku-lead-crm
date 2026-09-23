import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { drizzle } from "drizzle-orm/postgres-js";
import { inArray } from "drizzle-orm";
import postgres from "postgres";

import { ASSIGNEES, CAR_MODELS_BY_BRAND, SALES_ROOMS, SHOWROOMS } from "../src/lib/constants";
import * as schema from "../src/lib/db/schema";
import { generateDemoData } from "../src/lib/mock-data";
import type { Brand } from "../src/lib/types";

const seedDemoLeads =
  process.env.SEED_DEMO_LEADS === "1" || process.argv.includes("--demo");

const CHUNK = 500;

function chunked<T>(rows: T[], size = CHUNK): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < rows.length; i += size) out.push(rows.slice(i, i + size));
  return out;
}

/**
 * Tên phòng bán hàng có dạng "KIA MAZDA_PHÒNG 1_Trần Thanh Điệp" — phần sau dấu
 * gạch dưới cuối là trưởng phòng, dùng để nối sang app_users.
 */
function managerNameOf(salesRoom: string) {
  return salesRoom.split("_").pop()?.trim() ?? null;
}

type CatalogMaps = {
  showroomIdByName: Map<string, string>;
  userIdByName: Map<string, string>;
  salesRoomIdByName: Map<string, string>;
  carModelIdByKey: Map<string, string>;
};

/** Bổ sung danh mục thiếu — không xóa lead hay hàng tham chiếu đang được lead trỏ tới. */
async function ensureCatalogs(db: ReturnType<typeof drizzle>): Promise<CatalogMaps> {
  await db
    .insert(schema.showrooms)
    .values(SHOWROOMS.map((name, i) => ({ name, sortOrder: i })))
    .onConflictDoNothing({ target: schema.showrooms.name });

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
          role: fullName === ASSIGNEES[0] ? ("ADMIN" as const) : ("SALES" as const),
        })),
      )
      .returning({ id: schema.appUsers.id, fullName: schema.appUsers.fullName });
    for (const row of inserted) userIdByName.set(row.fullName, row.id);
  }

  await db
    .insert(schema.salesRooms)
    .values(
      SALES_ROOMS.map((name) => {
        const manager = managerNameOf(name);
        return { name, managerId: manager ? (userIdByName.get(manager) ?? null) : null };
      }),
    )
    .onConflictDoNothing({ target: schema.salesRooms.name });

  const carModelValues = Object.entries(CAR_MODELS_BY_BRAND).flatMap(([brand, models]) =>
    models.map((name) => ({ brand: brand as Brand, name })),
  );
  await db.insert(schema.carModels).values(carModelValues).onConflictDoNothing({
    target: [schema.carModels.brand, schema.carModels.name],
  });

  const showroomRows = await db
    .select({ id: schema.showrooms.id, name: schema.showrooms.name })
    .from(schema.showrooms)
    .where(inArray(schema.showrooms.name, [...SHOWROOMS]));
  const salesRoomRows = await db
    .select({ id: schema.salesRooms.id, name: schema.salesRooms.name })
    .from(schema.salesRooms)
    .where(inArray(schema.salesRooms.name, [...SALES_ROOMS]));
  const carModelRows = await db
    .select({
      id: schema.carModels.id,
      brand: schema.carModels.brand,
      name: schema.carModels.name,
    })
    .from(schema.carModels);

  return {
    showroomIdByName: new Map(showroomRows.map((r) => [r.name, r.id])),
    userIdByName,
    salesRoomIdByName: new Map(salesRoomRows.map((r) => [r.name, r.id])),
    carModelIdByKey: new Map(carModelRows.map((r) => [`${r.brand}|${r.name}`, r.id])),
  };
}

/** Xóa sạch và nạp lại danh mục (chế độ demo — sẽ xóa lead trước). */
async function replaceCatalogs(db: ReturnType<typeof drizzle>): Promise<CatalogMaps> {
  await db.delete(schema.salesRooms);
  await db.delete(schema.appUsers);
  await db.delete(schema.carModels);
  await db.delete(schema.showrooms);

  const showroomRows = await db
    .insert(schema.showrooms)
    .values(SHOWROOMS.map((name, i) => ({ name, sortOrder: i })))
    .returning({ id: schema.showrooms.id, name: schema.showrooms.name });
  const showroomIdByName = new Map(showroomRows.map((r) => [r.name, r.id]));

  const userRows = await db
    .insert(schema.appUsers)
    .values(
      ASSIGNEES.map((fullName, i) => ({
        fullName,
        role: i === 0 ? ("ADMIN" as const) : ("SALES" as const),
      })),
    )
    .returning({ id: schema.appUsers.id, fullName: schema.appUsers.fullName });
  const userIdByName = new Map(userRows.map((r) => [r.fullName, r.id]));

  const salesRoomRows = await db
    .insert(schema.salesRooms)
    .values(
      SALES_ROOMS.map((name) => {
        const manager = managerNameOf(name);
        return { name, managerId: manager ? (userIdByName.get(manager) ?? null) : null };
      }),
    )
    .returning({ id: schema.salesRooms.id, name: schema.salesRooms.name });
  const salesRoomIdByName = new Map(salesRoomRows.map((r) => [r.name, r.id]));

  const carModelValues = Object.entries(CAR_MODELS_BY_BRAND).flatMap(([brand, models]) =>
    models.map((name) => ({ brand: brand as Brand, name })),
  );
  const carModelRows = await db
    .insert(schema.carModels)
    .values(carModelValues)
    .returning({ id: schema.carModels.id, brand: schema.carModels.brand, name: schema.carModels.name });
  const carModelIdByKey = new Map(carModelRows.map((r) => [`${r.brand}|${r.name}`, r.id]));

  return { showroomIdByName, userIdByName, salesRoomIdByName, carModelIdByKey };
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
    console.log(
      `  ${maps.showroomIdByName.size} showroom · ${maps.userIdByName.size} nhân sự · ${maps.salesRoomIdByName.size} phòng bán hàng · ${maps.carModelIdByKey.size} dòng xe (trong DB)`,
    );
    await sql.end();
    console.log("Xong. Không nạp lead demo — dùng pnpm db:seed:demo chỉ trên DB dev trống.");
    return;
  }

  console.log("Xóa dữ liệu cũ (lead + danh mục)…");
  await db.delete(schema.activityLogs);
  await db.delete(schema.leads);

  console.log("Nạp lại danh mục tham chiếu…");
  const { showroomIdByName, userIdByName, salesRoomIdByName, carModelIdByKey } =
    await replaceCatalogs(db);

  console.log(
    `  ${showroomIdByName.size} showroom · ${userIdByName.size} nhân sự · ${salesRoomIdByName.size} phòng bán hàng · ${carModelIdByKey.size} dòng xe`,
  );

  console.log("Sinh dữ liệu demo…");
  const { leads, logsByLead } = generateDemoData(new Date());

  const mockIdToDbId = new Map(leads.map((lead) => [lead.id, randomUUID()]));

  const leadValues = leads.map((lead) => {
    const showroomId = showroomIdByName.get(lead.showroom);
    const salesRoomId = salesRoomIdByName.get(lead.salesRoom);
    if (!showroomId || !salesRoomId) {
      throw new Error(`Không map được showroom/phòng bán hàng cho lead ${lead.id}`);
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
      pushedToB10: lead.pushedToB10,
      b10Status: lead.b10Status,
      b10CareNote: lead.b10CareNote,
      source: lead.source,
      channelDetail: lead.channelDetail,
      brand: lead.brand,
      showroomId,
      salesRoomId,
      assigneeId: lead.assignee ? (userIdByName.get(lead.assignee) ?? null) : null,
      carModelId: lead.carModel ? (carModelIdByKey.get(`${lead.brand}|${lead.carModel}`) ?? null) : null,
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
