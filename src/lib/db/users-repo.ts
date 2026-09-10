import { and, asc, count, eq, ne, sql } from "drizzle-orm";

import type { UserRole } from "@/lib/auth/roles";
import { getDb } from "@/lib/db/client";
import { appUsers, showrooms } from "@/lib/db/schema";

export interface ManagedUser {
  id: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  showroomId: string | null;
  showroomName: string | null;
  active: boolean;
  hasAuth: boolean;
  assignedLeadCount: number;
}

export interface ShowroomOption {
  id: string;
  name: string;
}

export interface CreateUserInput {
  fullName: string;
  email: string | null;
  role: UserRole;
  showroomId: string | null;
  active?: boolean;
}

export interface UpdateUserInput {
  id: string;
  fullName?: string;
  email?: string | null;
  role?: UserRole;
  showroomId?: string | null;
  active?: boolean;
}

function normalizeEmail(email: string | null | undefined): string | null {
  const value = email?.trim().toLowerCase() ?? "";
  return value.length > 0 ? value : null;
}

function validateRoleScope(role: UserRole, showroomId: string | null) {
  if (role === "SHOWROOM_MANAGER" && !showroomId) {
    throw new Error("Quản lý showroom bắt buộc chọn showroom.");
  }
}

export async function listShowroomOptions(): Promise<ShowroomOption[]> {
  return getDb()
    .select({ id: showrooms.id, name: showrooms.name })
    .from(showrooms)
    .where(eq(showrooms.active, true))
    .orderBy(asc(showrooms.sortOrder), asc(showrooms.name));
}

export async function listManagedUsers(): Promise<ManagedUser[]> {
  const db = getDb();
  const rows = await db
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      email: appUsers.email,
      role: appUsers.role,
      showroomId: appUsers.showroomId,
      showroomName: showrooms.name,
      active: appUsers.active,
      hasAuth: sql<boolean>`${appUsers.authUserId} is not null`,
      assignedLeadCount: sql<number>`(
        select count(*)::int from leads where leads.assignee_id = ${appUsers.id}
      )`,
    })
    .from(appUsers)
    .leftJoin(showrooms, eq(appUsers.showroomId, showrooms.id))
    .orderBy(asc(appUsers.fullName));

  return rows.map((row) => ({
    id: row.id,
    fullName: row.fullName,
    email: row.email,
    role: row.role,
    showroomId: row.showroomId,
    showroomName: row.showroomName,
    active: row.active,
    hasAuth: Boolean(row.hasAuth),
    assignedLeadCount: Number(row.assignedLeadCount ?? 0),
  }));
}

async function countActiveAdmins(excludeId?: string) {
  const db = getDb();
  const condition = excludeId
    ? and(eq(appUsers.role, "ADMIN"), eq(appUsers.active, true), ne(appUsers.id, excludeId))
    : and(eq(appUsers.role, "ADMIN"), eq(appUsers.active, true));
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

export async function createManagedUser(input: CreateUserInput): Promise<ManagedUser> {
  const fullName = input.fullName.trim();
  if (!fullName) throw new Error("Họ tên không được để trống.");

  const email = normalizeEmail(input.email);
  const showroomId = input.showroomId;
  validateRoleScope(input.role, showroomId);
  await assertEmailAvailable(email);

  const db = getDb();
  const [row] = await db
    .insert(appUsers)
    .values({
      fullName,
      email,
      role: input.role,
      showroomId,
      active: input.active ?? true,
    })
    .returning({ id: appUsers.id });

  const users = await listManagedUsers();
  const created = users.find((u) => u.id === row.id);
  if (!created) throw new Error("Tạo tài khoản thất bại.");
  return created;
}

export async function updateManagedUser(
  input: UpdateUserInput,
  actorAppUserId: string | null,
): Promise<ManagedUser> {
  const db = getDb();
  const current = await db.select().from(appUsers).where(eq(appUsers.id, input.id)).limit(1);
  const row = current[0];
  if (!row) throw new Error("Không tìm thấy nhân sự.");

  const nextRole = input.role ?? row.role;
  const nextShowroomId = input.showroomId !== undefined ? input.showroomId : row.showroomId;
  const nextActive = input.active ?? row.active;
  const nextFullName = input.fullName !== undefined ? input.fullName.trim() : row.fullName;
  const nextEmail = input.email !== undefined ? normalizeEmail(input.email) : row.email;

  if (!nextFullName) throw new Error("Họ tên không được để trống.");
  validateRoleScope(nextRole, nextShowroomId);
  await assertEmailAvailable(nextEmail, row.id);

  const isSelf = actorAppUserId !== null && actorAppUserId === row.id;
  if (isSelf && nextActive === false) {
    throw new Error("Không thể tự vô hiệu hóa tài khoản của mình.");
  }
  if (isSelf && nextRole !== "ADMIN" && row.role === "ADMIN") {
    throw new Error("Không thể tự hạ quyền ADMIN của mình.");
  }

  const wasActiveAdmin = row.role === "ADMIN" && row.active;
  const willBeActiveAdmin = nextRole === "ADMIN" && nextActive;
  if (wasActiveAdmin && !willBeActiveAdmin) {
    const others = await countActiveAdmins(row.id);
    if (others === 0) throw new Error("Phải còn ít nhất một ADMIN đang hoạt động.");
  }

  await db
    .update(appUsers)
    .set({
      fullName: nextFullName,
      email: nextEmail,
      role: nextRole,
      showroomId: nextShowroomId,
      active: nextActive,
    })
    .where(eq(appUsers.id, row.id));

  const users = await listManagedUsers();
  const updated = users.find((u) => u.id === row.id);
  if (!updated) throw new Error("Cập nhật thất bại.");
  return updated;
}
