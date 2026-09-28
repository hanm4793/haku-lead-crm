import { cookies } from "next/headers";
import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";

import type { UserRole } from "@/lib/auth/roles";
import { DEFAULT_CATALOG_LABELS, DEFAULT_PROJECT_NAME, DEFAULT_PROJECT_SLUG } from "@/lib/constants";
import { getDb } from "@/lib/db/client";
import { appUsers, facebookPages, projectAdAccounts, projectMembers, projects } from "@/lib/db/schema";
import type { CatalogLabels, ProjectInfo } from "@/lib/types";

export const ACTIVE_PROJECT_COOKIE = "semtop_project_id";

export type ProjectRow = typeof projects.$inferSelect;
export type AdPlatform = "google" | "tiktok" | "zalo";

export type ProjectAdAccountRow = {
  id: string;
  projectId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name: string | null;
  active: boolean;
};

/**
 * Phase B chạy một project duy nhất (DEFAULT_PROJECT_SLUG). Nếu slug đó chưa
 * có thì lấy project active đầu tiên, để DB seed tay vẫn chạy được.
 */
export async function getDefaultProject(): Promise<ProjectRow | null> {
  const db = getDb();
  const [bySlug] = await db
    .select()
    .from(projects)
    .where(eq(projects.slug, DEFAULT_PROJECT_SLUG))
    .limit(1);
  if (bySlug) return bySlug;

  const [firstActive] = await db
    .select()
    .from(projects)
    .where(eq(projects.active, true))
    .orderBy(asc(projects.createdAt))
    .limit(1);
  return firstActive ?? null;
}

export async function listProjects(options: { activeOnly?: boolean } = {}): Promise<ProjectRow[]> {
  const db = getDb();
  if (options.activeOnly) {
    return db
      .select()
      .from(projects)
      .where(eq(projects.active, true))
      .orderBy(asc(projects.name));
  }
  return db.select().from(projects).orderBy(asc(projects.name));
}

export async function getProjectById(id: string): Promise<ProjectRow | null> {
  const [row] = await getDb().select().from(projects).where(eq(projects.id, id)).limit(1);
  return row ?? null;
}

/** Tạo project mặc định nếu chưa có — dùng cho seed. */
export async function ensureDefaultProject(): Promise<ProjectRow> {
  const existing = await getDefaultProject();
  if (existing) return existing;

  const [inserted] = await getDb()
    .insert(projects)
    .values({
      slug: DEFAULT_PROJECT_SLUG,
      name: DEFAULT_PROJECT_NAME,
      brandLabel: DEFAULT_CATALOG_LABELS.brand,
      productLabel: DEFAULT_CATALOG_LABELS.product,
      locationLabel: DEFAULT_CATALOG_LABELS.location,
    })
    .onConflictDoNothing({ target: projects.slug })
    .returning();
  if (inserted) return inserted;

  const again = await getDefaultProject();
  if (!again) throw new Error("Không tạo được project mặc định.");
  return again;
}

/** Nhãn hiển thị của 3 dimension. `null` → fallback nhãn ngành ô tô. */
export function getCatalogLabels(project: ProjectRow | ProjectInfo | null | undefined): CatalogLabels {
  if (!project) return DEFAULT_CATALOG_LABELS;
  if ("labels" in project) return project.labels;
  return {
    brand: project.brandLabel || DEFAULT_CATALOG_LABELS.brand,
    product: project.productLabel || DEFAULT_CATALOG_LABELS.product,
    location: project.locationLabel || DEFAULT_CATALOG_LABELS.location,
  };
}

export function toProjectInfo(project: ProjectRow): ProjectInfo {
  return {
    id: project.id,
    slug: project.slug,
    name: project.name,
    labels: getCatalogLabels(project),
  };
}

export type ProjectViewer = {
  role: UserRole;
  /** app_users.project_id — primary / legacy. */
  projectId?: string | null;
  appUserId?: string | null;
  partnerId?: string | null;
  /** Cache membership — nếu thiếu sẽ query lại. */
  projectIds?: string[];
};

export async function listProjectIdsForUser(userId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ projectId: projectMembers.projectId })
    .from(projectMembers)
    .where(eq(projectMembers.userId, userId));
  return rows.map((r) => r.projectId);
}

export async function listProjectIdsForViewer(viewer: ProjectViewer): Promise<string[]> {
  if (viewer.projectIds?.length) {
    return filterActiveProjectIds(viewer.projectIds, viewer.role === "SUPER_ADMIN");
  }

  if (viewer.role === "SUPER_ADMIN") {
    const rows = await getDb()
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.active, true))
      .orderBy(asc(projects.name));
    return rows.map((r) => r.id);
  }

  const userId = viewer.appUserId;
  if (!userId) {
    return viewer.projectId ? [viewer.projectId] : [];
  }

  let ids = await listProjectIdsForUser(userId);
  if (viewer.role === "STAFF" && viewer.partnerId) {
    const partnerIds = await listProjectIdsForUser(viewer.partnerId);
    ids = [...new Set([...ids, ...partnerIds])];
  }
  if (ids.length === 0 && viewer.projectId) {
    ids = [viewer.projectId];
  }
  return filterActiveProjectIds(ids, false);
}

async function filterActiveProjectIds(ids: string[], includeInactive: boolean): Promise<string[]> {
  if (!ids.length) return [];
  if (includeInactive) return ids;
  const rows = await getDb()
    .select({ id: projects.id })
    .from(projects)
    .where(and(inArray(projects.id, ids), eq(projects.active, true)));
  const active = new Set(rows.map((r) => r.id));
  return ids.filter((id) => active.has(id));
}

export async function assertCanAccessProject(viewer: ProjectViewer, projectId: string): Promise<void> {
  if (viewer.role === "SUPER_ADMIN") return;
  const allowed = await listProjectIdsForViewer(viewer);
  if (!allowed.includes(projectId)) {
    throw new Error("Bạn không có quyền truy cập project này.");
  }
}

/**
 * Project đang làm việc:
 * - Super admin → cookie hoặc mặc định (mọi project active)
 * - Partner/Staff → cookie nếu thuộc tập được phép, không thì project đầu tiên
 */
export async function resolveActiveProject(viewer: ProjectViewer): Promise<ProjectRow> {
  const jar = await cookies();
  const cookieId = jar.get(ACTIVE_PROJECT_COOKIE)?.value ?? null;

  if (viewer.role === "SUPER_ADMIN") {
    if (cookieId) {
      const fromCookie = await getProjectById(cookieId);
      if (fromCookie?.active) return fromCookie;
    }
    const def = await getDefaultProject();
    if (!def) throw new Error("Chưa có project. Hãy tạo project đầu tiên tại menu Dự án.");
    return def;
  }

  const allowed = await listProjectIdsForViewer(viewer);
  if (cookieId && allowed.includes(cookieId)) {
    const fromCookie = await getProjectById(cookieId);
    if (fromCookie?.active) return fromCookie;
  }

  if (allowed.length > 0) {
    const first = await getProjectById(allowed[0]!);
    if (first?.active) return first;
  }

  if (viewer.projectId) {
    const mine = await getProjectById(viewer.projectId);
    if (mine?.active) return mine;
  }

  const fallback = await getDefaultProject();
  if (!fallback) throw new Error("Chưa có project. Super admin cần tạo project trước.");
  throw new Error("Tài khoản chưa được gán project nào.");
}

export async function addProjectMember(projectId: string, userId: string): Promise<void> {
  await getDb()
    .insert(projectMembers)
    .values({ projectId, userId })
    .onConflictDoNothing();
}

export async function removeProjectMember(projectId: string, userId: string): Promise<void> {
  await getDb()
    .delete(projectMembers)
    .where(and(eq(projectMembers.projectId, projectId), eq(projectMembers.userId, userId)));
}

export async function createProject(input: {
  slug: string;
  name: string;
  brandLabel?: string;
  productLabel?: string;
  locationLabel?: string;
}): Promise<ProjectRow> {
  const slug = input.slug
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, "-")
    .replace(/^-|-$/g, "");
  if (!slug) throw new Error("Slug project không hợp lệ.");
  const name = input.name.trim();
  if (!name) throw new Error("Tên project bắt buộc.");

  const [row] = await getDb()
    .insert(projects)
    .values({
      slug,
      name,
      brandLabel: input.brandLabel?.trim() || "Thương hiệu",
      productLabel: input.productLabel?.trim() || "Sản phẩm",
      locationLabel: input.locationLabel?.trim() || "Địa điểm",
    })
    .returning();
  if (!row) throw new Error("Không tạo được project.");
  return row;
}

export async function updateProject(
  id: string,
  patch: Partial<{
    name: string;
    brandLabel: string;
    productLabel: string;
    locationLabel: string;
    active: boolean;
  }>,
): Promise<ProjectRow> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.name !== undefined) {
    const name = patch.name.trim();
    if (!name) throw new Error("Tên project bắt buộc.");
    values.name = name;
  }
  if (patch.brandLabel !== undefined) values.brandLabel = patch.brandLabel.trim() || "Thương hiệu";
  if (patch.productLabel !== undefined) values.productLabel = patch.productLabel.trim() || "Sản phẩm";
  if (patch.locationLabel !== undefined) values.locationLabel = patch.locationLabel.trim() || "Địa điểm";
  if (patch.active !== undefined) values.active = patch.active;

  const [row] = await getDb().update(projects).set(values).where(eq(projects.id, id)).returning();
  if (!row) throw new Error("Không tìm thấy project.");
  return row;
}

export async function assignFacebookPageToProject(pageId: string, projectId: string | null) {
  const [row] = await getDb()
    .update(facebookPages)
    .set({ projectId, updatedAt: new Date() })
    .where(eq(facebookPages.id, pageId))
    .returning({
      id: facebookPages.id,
      facebookPageId: facebookPages.facebookPageId,
      name: facebookPages.name,
      projectId: facebookPages.projectId,
      active: facebookPages.active,
    });
  if (!row) throw new Error("Không tìm thấy Fanpage.");
  return row;
}

export async function assignUserToProject(userId: string, projectId: string | null) {
  const [target] = await getDb()
    .select({ id: appUsers.id, role: appUsers.role })
    .from(appUsers)
    .where(eq(appUsers.id, userId))
    .limit(1);
  if (!target) throw new Error("Không tìm thấy tài khoản.");
  if (target.role === "SUPER_ADMIN") {
    throw new Error("Không gán project cho super admin.");
  }

  const [row] = await getDb()
    .update(appUsers)
    .set({ projectId })
    .where(eq(appUsers.id, userId))
    .returning({ id: appUsers.id, projectId: appUsers.projectId, role: appUsers.role });
  if (projectId && row) {
    await addProjectMember(projectId, userId);
  }
  return row!;
}

/** Gán partner (và staff) vào project — thêm membership, giữ project_id làm primary. */
export async function assignPartnerAndStaffToProject(partnerId: string, projectId: string) {
  await addProjectMember(projectId, partnerId);
  await assignUserToProject(partnerId, projectId);
  const staffRows = await getDb()
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(and(eq(appUsers.partnerId, partnerId), eq(appUsers.role, "STAFF")));
  for (const staff of staffRows) {
    await addProjectMember(projectId, staff.id);
  }
  await getDb()
    .update(appUsers)
    .set({ projectId })
    .where(and(eq(appUsers.partnerId, partnerId), eq(appUsers.role, "STAFF")));
}

export async function listPartnersInProject(projectId: string) {
  return getDb()
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      active: appUsers.active,
    })
    .from(appUsers)
    .innerJoin(projectMembers, eq(projectMembers.userId, appUsers.id))
    .where(and(eq(projectMembers.projectId, projectId), eq(appUsers.role, "PARTNER_ADMIN")))
    .orderBy(asc(appUsers.fullName));
}

/** Partner chưa là thành viên của project này (có thể thuộc project khác). */
export async function listPartnersNotInProject(projectId: string) {
  const members = await getDb()
    .select({ userId: projectMembers.userId })
    .from(projectMembers)
    .where(eq(projectMembers.projectId, projectId));
  const memberIds = members.map((m) => m.userId);

  const all = await getDb()
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      projectId: appUsers.projectId,
      active: appUsers.active,
    })
    .from(appUsers)
    .where(eq(appUsers.role, "PARTNER_ADMIN"))
    .orderBy(asc(appUsers.fullName));

  if (!memberIds.length) return all;
  return all.filter((p) => !memberIds.includes(p.id));
}

/** Partner chưa có membership ở bất kỳ project nào. */
export async function listUnassignedPartners() {
  const withMembership = await getDb().select({ userId: projectMembers.userId }).from(projectMembers);
  const memberSet = new Set(withMembership.map((m) => m.userId));
  const all = await getDb()
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      projectId: appUsers.projectId,
      active: appUsers.active,
    })
    .from(appUsers)
    .where(eq(appUsers.role, "PARTNER_ADMIN"))
    .orderBy(asc(appUsers.fullName));
  return all.filter((p) => !memberSet.has(p.id));
}

export type ProjectListStats = {
  id: string;
  slug: string;
  name: string;
  active: boolean;
  pageCount: number;
  partnerCount: number;
};

export async function listProjectsWithStatsForViewer(viewer: ProjectViewer): Promise<ProjectListStats[]> {
  const allowed = await listProjectIdsForViewer(viewer);
  const db = getDb();
  let rows: ProjectRow[];
  if (viewer.role === "SUPER_ADMIN") {
    rows = await listProjects();
  } else if (!allowed.length) {
    return [];
  } else {
    rows = await db.select().from(projects).where(inArray(projects.id, allowed)).orderBy(asc(projects.name));
  }

  const projectIds = rows.map((r) => r.id);
  const pageCounts =
    projectIds.length === 0
      ? []
      : await db
          .select({
            projectId: facebookPages.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(facebookPages)
          .where(inArray(facebookPages.projectId, projectIds))
          .groupBy(facebookPages.projectId);

  const partnerCounts =
    projectIds.length === 0
      ? []
      : await db
          .select({
            projectId: projectMembers.projectId,
            count: sql<number>`count(*)::int`,
          })
          .from(projectMembers)
          .innerJoin(appUsers, eq(appUsers.id, projectMembers.userId))
          .where(and(inArray(projectMembers.projectId, projectIds), eq(appUsers.role, "PARTNER_ADMIN")))
          .groupBy(projectMembers.projectId);

  const pagesByProject = new Map(pageCounts.map((r) => [r.projectId, r.count]));
  const partnersByProject = new Map(partnerCounts.map((r) => [r.projectId, r.count]));

  return rows.map((row) => ({
    id: row.id,
    slug: row.slug,
    name: row.name,
    active: row.active,
    pageCount: pagesByProject.get(row.id) ?? 0,
    partnerCount: partnersByProject.get(row.id) ?? 0,
  }));
}

export async function listAdAccounts(projectId: string): Promise<ProjectAdAccountRow[]> {
  return getDb()
    .select({
      id: projectAdAccounts.id,
      projectId: projectAdAccounts.projectId,
      platform: projectAdAccounts.platform,
      externalAccountId: projectAdAccounts.externalAccountId,
      name: projectAdAccounts.name,
      active: projectAdAccounts.active,
    })
    .from(projectAdAccounts)
    .where(eq(projectAdAccounts.projectId, projectId))
    .orderBy(asc(projectAdAccounts.platform), asc(projectAdAccounts.name));
}

export async function upsertAdAccount(input: {
  projectId: string;
  platform: AdPlatform;
  externalAccountId: string;
  name?: string | null;
  config?: Record<string, string>;
}): Promise<ProjectAdAccountRow> {
  const externalAccountId = input.externalAccountId.trim();
  if (!externalAccountId) throw new Error("Account ID bắt buộc.");

  const db = getDb();
  const [existing] = await db
    .select({ id: projectAdAccounts.id })
    .from(projectAdAccounts)
    .where(
      and(
        eq(projectAdAccounts.projectId, input.projectId),
        eq(projectAdAccounts.platform, input.platform),
        eq(projectAdAccounts.externalAccountId, externalAccountId),
      ),
    )
    .limit(1);

  if (existing) {
    const [row] = await db
      .update(projectAdAccounts)
      .set({
        name: input.name?.trim() || null,
        config: input.config ?? {},
        active: true,
        updatedAt: new Date(),
      })
      .where(eq(projectAdAccounts.id, existing.id))
      .returning({
        id: projectAdAccounts.id,
        projectId: projectAdAccounts.projectId,
        platform: projectAdAccounts.platform,
        externalAccountId: projectAdAccounts.externalAccountId,
        name: projectAdAccounts.name,
        active: projectAdAccounts.active,
      });
    return row!;
  }

  const [row] = await db
    .insert(projectAdAccounts)
    .values({
      projectId: input.projectId,
      platform: input.platform,
      externalAccountId,
      name: input.name?.trim() || null,
      config: input.config ?? {},
      active: true,
    })
    .returning({
      id: projectAdAccounts.id,
      projectId: projectAdAccounts.projectId,
      platform: projectAdAccounts.platform,
      externalAccountId: projectAdAccounts.externalAccountId,
      name: projectAdAccounts.name,
      active: projectAdAccounts.active,
    });
  return row!;
}

export async function setAdAccountActive(id: string, active: boolean) {
  const [row] = await getDb()
    .update(projectAdAccounts)
    .set({ active, updatedAt: new Date() })
    .where(eq(projectAdAccounts.id, id))
    .returning({
      id: projectAdAccounts.id,
      projectId: projectAdAccounts.projectId,
      platform: projectAdAccounts.platform,
      externalAccountId: projectAdAccounts.externalAccountId,
      name: projectAdAccounts.name,
      active: projectAdAccounts.active,
    });
  if (!row) throw new Error("Không tìm thấy tài khoản ads.");
  return row;
}

export async function removeAdAccount(id: string) {
  const deleted = await getDb()
    .delete(projectAdAccounts)
    .where(eq(projectAdAccounts.id, id))
    .returning({ id: projectAdAccounts.id });
  if (!deleted.length) throw new Error("Không tìm thấy tài khoản ads.");
}

export async function listFacebookPageIdsForProject(projectId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ facebookPageId: facebookPages.facebookPageId })
    .from(facebookPages)
    .where(and(eq(facebookPages.projectId, projectId), eq(facebookPages.active, true)));
  return rows.map((r) => r.facebookPageId);
}

/** Partner không thuộc project này — dùng khi gán. */
export async function assertPartnerAssignable(userId: string) {
  const [row] = await getDb()
    .select({ id: appUsers.id, role: appUsers.role })
    .from(appUsers)
    .where(and(eq(appUsers.id, userId), ne(appUsers.role, "SUPER_ADMIN")))
    .limit(1);
  if (!row || row.role !== "PARTNER_ADMIN") {
    throw new Error("Chỉ gán được partner admin vào project.");
  }
}

export async function listProjectsForSwitcher(viewer: ProjectViewer): Promise<ProjectInfo[]> {
  const ids = await listProjectIdsForViewer(viewer);
  if (!ids.length) {
    if (viewer.role === "SUPER_ADMIN") {
      const rows = await listProjects({ activeOnly: true });
      return rows.map(toProjectInfo);
    }
    return [];
  }
  const rows = await getDb()
    .select()
    .from(projects)
    .where(and(inArray(projects.id, ids), eq(projects.active, true)))
    .orderBy(asc(projects.name));
  return rows.map(toProjectInfo);
}

export function toProjectViewer(scope: {
  role: UserRole;
  projectId?: string | null;
  appUserId?: string | null;
  partnerId?: string | null;
  projectIds?: string[];
}): ProjectViewer {
  return {
    role: scope.role,
    projectId: scope.projectId ?? null,
    appUserId: scope.appUserId ?? null,
    partnerId: scope.partnerId ?? null,
    projectIds: scope.projectIds,
  };
}

export async function getUsersByIds(ids: string[]) {
  if (!ids.length) return [];
  return getDb()
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      role: appUsers.role,
      projectId: appUsers.projectId,
      active: appUsers.active,
    })
    .from(appUsers)
    .where(inArray(appUsers.id, ids));
}
