import { and, asc, count, eq, inArray, ne, sql } from "drizzle-orm";
import { alias } from "drizzle-orm/pg-core";

import {
  assertCanManageAccount,
  guardAccountUpdate,
  prepareCreateAccount,
  rejectNewSuperAdmin,
  type UserRole,
} from "@/lib/auth/roles";
import type { ViewerScope } from "@/lib/db/leads-repo";
import { getDb } from "@/lib/db/client";
import { addProjectMember } from "@/lib/db/project-repo";
import { appUsers, userFacebookPages } from "@/lib/db/schema";

const partnerUser = alias(appUsers, "partner_user");

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  active: boolean;
  hasAuth: boolean;
  assignedLeadCount: number;
  aiEnabled: boolean;
  partnerId: string | null;
  partnerName: string | null;
  pageIds: string[];
}

export interface CreateUserInput {
  fullName: string;
  email: string | null;
  role: UserRole;
  active?: boolean;
  aiEnabled?: boolean;
  partnerId?: string | null;
  projectId?: string | null;
  pageIds?: string[];
}

export interface UpdateUserInput {
  id: string;
  fullName?: string;
  email?: string | null;
  role?: UserRole;
  active?: boolean;
  aiEnabled?: boolean;
  partnerId?: string | null;
  projectId?: string | null;
  pageIds?: string[];
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value.length > 0 ? value : null;
}

/** Tên nhân viên có thể giao lead: toàn bộ staff với super admin, staff của partner với partner-admin và nhân viên. */
export async function listAssignableStaff(actor: ViewerScope): Promise<string[]> {
  const db = getDb();
  if (actor.role === "SUPER_ADMIN") {
    const rows = await db
      .select({ name: appUsers.fullName })
      .from(appUsers)
      .where(and(eq(appUsers.role, "STAFF"), eq(appUsers.active, true)))
      .orderBy(asc(appUsers.fullName));
    return rows.map((row) => row.name);
  }

  let partnerId = actor.role === "PARTNER_ADMIN" ? (actor.appUserId ?? null) : null;
  if (actor.role === "STAFF" && actor.appUserId) {
    const [self] = await db
      .select({ partnerId: appUsers.partnerId })
      .from(appUsers)
      .where(eq(appUsers.id, actor.appUserId))
      .limit(1);
    partnerId = self?.partnerId ?? null;
  }
  if (!partnerId) return [];

  const rows = await db
    .select({ name: appUsers.fullName })
    .from(appUsers)
    .where(and(eq(appUsers.role, "STAFF"), eq(appUsers.partnerId, partnerId), eq(appUsers.active, true)))
    .orderBy(asc(appUsers.fullName));
  return rows.map((row) => row.name);
}

export async function listManagedUsers(actor: ViewerScope): Promise<ManagedUser[]> {
  const db = getDb();
  if (actor.role === "PARTNER_ADMIN" && !actor.appUserId) return [];
  const scope =
    actor.role === "PARTNER_ADMIN" && actor.appUserId
      ? and(eq(appUsers.role, "STAFF"), eq(appUsers.partnerId, actor.appUserId))
      : undefined;

  const rows = await db
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      role: appUsers.role,
      active: appUsers.active,
      hasAuth: sql<boolean>`${appUsers.authUserId} is not null`,
      assignedLeadCount: sql<number>`(
        select count(*)::int from leads where leads.assignee_id = ${appUsers.id}
      )`,
      aiEnabled: appUsers.aiEnabled,
      partnerId: appUsers.partnerId,
      partnerName: partnerUser.fullName,
    })
    .from(appUsers)
    .leftJoin(partnerUser, eq(appUsers.partnerId, partnerUser.id))
    .where(scope)
    .orderBy(asc(appUsers.fullName));

  const ids = rows.map((row) => row.id);
  const grants =
    ids.length === 0
      ? []
      : await db
          .select({
            userId: userFacebookPages.userId,
            facebookPageId: userFacebookPages.facebookPageId,
          })
          .from(userFacebookPages)
          .where(inArray(userFacebookPages.userId, ids));
  const pagesByUser = new Map<string, string[]>();
  for (const grant of grants) {
    const list = pagesByUser.get(grant.userId) ?? [];
    list.push(grant.facebookPageId);
    pagesByUser.set(grant.userId, list);
  }

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    active: row.active,
    hasAuth: Boolean(row.hasAuth),
    assignedLeadCount: Number(row.assignedLeadCount ?? 0),
    aiEnabled: row.aiEnabled,
    partnerId: row.partnerId,
    partnerName: row.partnerName,
    pageIds: pagesByUser.get(row.id) ?? [],
  }));
}

async function countActiveSuperAdmins(excludeId?: string) {
  const db = getDb();
  const condition = excludeId
    ? and(eq(appUsers.role, "SUPER_ADMIN"), eq(appUsers.active, true), ne(appUsers.id, excludeId))
    : and(eq(appUsers.role, "SUPER_ADMIN"), eq(appUsers.active, true));
  const [row] = await db.select({ n: count() }).from(appUsers).where(condition);
  return Number(row?.n ?? 0);
}

async function assertEmailAvailable(email: string | null, excludeId?: string) {
  if (!email) return;
  const db = getDb();
  const rows = await db
    .select({ id: appUsers.id })
    .from(appUsers)
    .where(excludeId ? and(eq(appUsers.email, email), ne(appUsers.id, excludeId)) : eq(appUsers.email, email))
    .limit(1);
  if (rows[0]) throw new Error("Email đã được gán cho nhân sự khác.");
}

async function assertPartner(partnerId: string) {
  const [partner] = await getDb()
    .select({ id: appUsers.id, role: appUsers.role })
    .from(appUsers)
    .where(eq(appUsers.id, partnerId))
    .limit(1);
  if (!partner || partner.role !== "PARTNER_ADMIN") {
    throw new Error("Nhân viên phải thuộc một partner admin.");
  }
}

async function replacePageGrants(userId: string, pageIds: string[]) {
  const db = getDb();
  const unique = [...new Set(pageIds.map((id) => id.trim()).filter(Boolean))];
  await db.delete(userFacebookPages).where(eq(userFacebookPages.userId, userId));
  if (unique.length === 0) return;
  await db.insert(userFacebookPages).values(unique.map((facebookPageId) => ({ userId, facebookPageId })));
}

function assertActorCanTouch(actor: ViewerScope, target: { role: UserRole; partnerId: string | null }) {
  assertCanManageAccount(actor, target);
}

export async function createManagedUser(input: CreateUserInput, actor: ViewerScope): Promise<ManagedUser> {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Họ tên không được để trống.");

  const email = normalizeEmail(input.email);
  await assertEmailAvailable(email);

  const prepared = prepareCreateAccount(
    { role: actor.role, appUserId: actor.appUserId, projectId: actor.projectId ?? null },
    {
      role: input.role,
      partnerId: input.partnerId ?? null,
      projectId: input.projectId ?? null,
      aiEnabled: input.aiEnabled,
      pageIds: input.pageIds,
    },
  );
  const { role, partnerId, aiEnabled, pageIds } = prepared;
  let { projectId } = prepared;
  if (actor.role === "SUPER_ADMIN" && role === "STAFF" && partnerId) {
    await assertPartner(partnerId);
  }

  const db = getDb();
  if (role === "STAFF" && partnerId && !projectId) {
    const [partner] = await db
      .select({ projectId: appUsers.projectId })
      .from(appUsers)
      .where(eq(appUsers.id, partnerId))
      .limit(1);
    projectId = partner?.projectId ?? null;
  }

  const [row] = await db
    .insert(appUsers)
    .values({
      fullName,
      email,
      role,
      partnerId,
      projectId,
      aiEnabled,
      active: input.active ?? true,
    })
    .returning({ id: appUsers.id });

  if (role === "PARTNER_ADMIN") await replacePageGrants(row.id, pageIds);
  if (projectId && (role === "PARTNER_ADMIN" || role === "STAFF")) {
    await addProjectMember(projectId, row.id);
  }

  const users = await listManagedUsers(actor);
  const created = users.find((user) => user.id === row.id);
  if (!created) throw new Error("Tạo tài khoản thất bại.");
  return created;
}

export async function updateManagedUser(
  input: UpdateUserInput,
  actor: ViewerScope,
): Promise<ManagedUser> {
  const db = getDb();
  const current = await db.select().from(appUsers).where(eq(appUsers.id, input.id)).limit(1);
  const row = current[0];
  if (!row) throw new Error("Không tìm thấy nhân sự.");
  assertActorCanTouch(actor, row);

  const nextRole = actor.role === "PARTNER_ADMIN" ? row.role : (input.role ?? row.role);
  const nextActive = input.active ?? row.active;
  const nextFullName = input.fullName !== undefined ? input.fullName.trim() : row.fullName;
  const nextEmail = input.email !== undefined ? normalizeEmail(input.email) : row.email;
  let nextPartnerId = input.partnerId !== undefined ? input.partnerId : row.partnerId;
  let nextProjectId = input.projectId !== undefined ? input.projectId : row.projectId;
  let nextAi = row.aiEnabled;

  if (!nextFullName) throw new Error("Họ tên không được để trống.");
  await assertEmailAvailable(nextEmail, row.id);

  if (actor.role === "PARTNER_ADMIN") {
    nextPartnerId = actor.appUserId ?? row.partnerId;
    nextAi = false;
    if (nextRole !== "STAFF") throw new Error("Chỉ quản lý được nhân viên của bạn.");
  }

  if (actor.role === "SUPER_ADMIN") {
    rejectNewSuperAdmin(row.role, nextRole);
    if (nextRole === "STAFF") {
      if (!nextPartnerId) throw new Error("Nhân viên phải thuộc một partner admin.");
      await assertPartner(nextPartnerId);
      if (!nextProjectId && nextPartnerId) {
        const [partner] = await db
          .select({ projectId: appUsers.projectId })
          .from(appUsers)
          .where(eq(appUsers.id, nextPartnerId))
          .limit(1);
        nextProjectId = partner?.projectId ?? null;
      }
    }
    if (nextRole === "PARTNER_ADMIN") {
      nextPartnerId = null;
      if (input.projectId !== undefined) nextProjectId = input.projectId;
      if (!nextProjectId) throw new Error("Partner admin phải thuộc một project.");
      if (input.aiEnabled !== undefined) nextAi = input.aiEnabled;
    }
    if (nextRole === "SUPER_ADMIN") {
      nextPartnerId = null;
      nextProjectId = null;
    }
  }

  const isSelf = actor.appUserId !== null && actor.appUserId === row.id;
  const wasActiveAdmin = row.role === "SUPER_ADMIN" && row.active;
  const willBeActiveAdmin = nextRole === "SUPER_ADMIN" && nextActive;
  const otherActiveSuperAdmins =
    wasActiveAdmin && !willBeActiveAdmin ? await countActiveSuperAdmins(row.id) : 1;
  guardAccountUpdate({
    isSelf,
    wasSuperAdmin: row.role === "SUPER_ADMIN",
    wasActive: row.active,
    nextRole,
    nextActive,
    otherActiveSuperAdmins,
  });

  await db
    .update(appUsers)
    .set({
      fullName: nextFullName,
      email: nextEmail,
      role: nextRole,
      partnerId: nextPartnerId,
      projectId: nextProjectId,
      aiEnabled: nextRole === "PARTNER_ADMIN" ? nextAi : false,
      active: nextActive,
    })
    .where(eq(appUsers.id, row.id));

  if (actor.role === "SUPER_ADMIN" && nextRole === "PARTNER_ADMIN" && input.pageIds) {
    await replacePageGrants(row.id, input.pageIds);
  }
  if (nextRole !== "PARTNER_ADMIN") {
    await db.delete(userFacebookPages).where(eq(userFacebookPages.userId, row.id));
  }
  if (nextProjectId && (nextRole === "PARTNER_ADMIN" || nextRole === "STAFF")) {
    await addProjectMember(nextProjectId, row.id);
  }

  const users = await listManagedUsers(actor);
  const updated = users.find((user) => user.id === row.id);
  if (!updated) throw new Error("Cập nhật thất bại.");
  return updated;
}
