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
import {
  addProjectMember,
  assignPartnerAndStaffToProject,
  removePartnerAndStaffFromProject,
  removeProjectMember,
} from "@/lib/db/project-repo";
import { appUsers, facebookPages, projectMembers, userFacebookPages } from "@/lib/db/schema";

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
  projectId: string | null;
  projectIds: string[];
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
  projectIds?: string[];
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
  projectIds?: string[];
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
      projectId: appUsers.projectId,
    })
    .from(appUsers)
    .leftJoin(partnerUser, eq(appUsers.partnerId, partnerUser.id))
    .where(scope)
    .orderBy(asc(appUsers.fullName));

  const ids = rows.map((row) => row.id);
  const partnerIds = rows.map((row) => row.partnerId).filter((id): id is string => Boolean(id));
  const memberLookupIds = [...new Set([...ids, ...partnerIds])];
  const [grants, memberships] =
    ids.length === 0
      ? [[], []]
      : await Promise.all([
          db
            .select({
              userId: userFacebookPages.userId,
              facebookPageId: userFacebookPages.facebookPageId,
            })
            .from(userFacebookPages)
            .where(inArray(userFacebookPages.userId, ids)),
          db
            .select({
              userId: projectMembers.userId,
              projectId: projectMembers.projectId,
            })
            .from(projectMembers)
            .where(inArray(projectMembers.userId, memberLookupIds)),
        ]);

  const pagesByUser = new Map<string, string[]>();
  for (const grant of grants) {
    const list = pagesByUser.get(grant.userId) ?? [];
    list.push(grant.facebookPageId);
    pagesByUser.set(grant.userId, list);
  }

  const projectsByUser = new Map<string, string[]>();
  for (const member of memberships) {
    const list = projectsByUser.get(member.userId) ?? [];
    list.push(member.projectId);
    projectsByUser.set(member.userId, list);
  }

  return rows.map((row) => {
    const memberProjectIds = projectsByUser.get(row.id) ?? [];
    const partnerProjectIds =
      row.role === "STAFF" && row.partnerId ? (projectsByUser.get(row.partnerId) ?? []) : [];
    const validStaffMemberProjectIds =
      partnerProjectIds.length > 0
        ? memberProjectIds.filter((id) => partnerProjectIds.includes(id))
        : memberProjectIds;
    const projectIds =
      row.role === "STAFF"
        ? validStaffMemberProjectIds.length > 0
          ? validStaffMemberProjectIds
          : [
              ...new Set([
                ...(row.projectId && (partnerProjectIds.length === 0 || partnerProjectIds.includes(row.projectId))
                  ? [row.projectId]
                  : []),
                ...partnerProjectIds,
              ]),
            ]
        : [
            ...new Set([
              ...(row.projectId ? [row.projectId] : []),
              ...memberProjectIds,
            ]),
          ];
    return {
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
      projectId: row.projectId,
      projectIds,
      pageIds: pagesByUser.get(row.id) ?? [],
    };
  });
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

async function replacePageGrants(userId: string, pageIds: string[], allowedProjectIds?: string[]) {
  const db = getDb();
  let unique = [...new Set(pageIds.map((id) => id.trim()).filter(Boolean))];
  if (allowedProjectIds && allowedProjectIds.length > 0 && unique.length > 0) {
    const validPages = await db
      .select({ facebookPageId: facebookPages.facebookPageId })
      .from(facebookPages)
      .where(
        and(
          inArray(facebookPages.facebookPageId, unique),
          inArray(facebookPages.projectId, allowedProjectIds),
        ),
      );
    const validSet = new Set(validPages.map((p) => p.facebookPageId));
    unique = unique.filter((id) => validSet.has(id));
  }
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

  const requestedProjectIds = [...new Set((input.projectIds ?? []).map((id) => id.trim()).filter(Boolean))];
  const prepared = prepareCreateAccount(
    { role: actor.role, appUserId: actor.appUserId, projectId: actor.projectId ?? null },
    {
      role: input.role,
      partnerId: input.partnerId ?? null,
      projectId: input.projectId ?? requestedProjectIds[0] ?? null,
      projectIds: requestedProjectIds,
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
  let staffProjectIds: string[] = [];
  if (role === "STAFF" && partnerId) {
    const [partnerRows, partnerMemberships] = await Promise.all([
      db.select({ projectId: appUsers.projectId }).from(appUsers).where(eq(appUsers.id, partnerId)).limit(1),
      db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, partnerId)),
    ]);
    const partnerPrimary = partnerRows[0]?.projectId ?? null;
    const partnerProjectIds = [
      ...new Set([
        ...(partnerPrimary ? [partnerPrimary] : []),
        ...partnerMemberships.map((m) => m.projectId),
      ]),
    ];
    if (requestedProjectIds.length > 0) {
      const allowed =
        partnerProjectIds.length > 0
          ? requestedProjectIds.filter((id) => partnerProjectIds.includes(id))
          : requestedProjectIds;
      staffProjectIds = allowed.length > 0 ? allowed : partnerProjectIds;
      projectId = staffProjectIds[0] ?? partnerPrimary;
    } else {
      if (!projectId) projectId = partnerPrimary ?? partnerProjectIds[0] ?? null;
      staffProjectIds = partnerProjectIds.length > 0 ? partnerProjectIds : projectId ? [projectId] : [];
    }
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

  if (role === "PARTNER_ADMIN") {
    const partnerProjectIds = [...new Set([...(projectId ? [projectId] : []), ...requestedProjectIds])];
    await replacePageGrants(row.id, pageIds, partnerProjectIds);
    for (const pid of partnerProjectIds) {
      await addProjectMember(pid, row.id);
    }
  } else if (role === "STAFF") {
    const targetProjectIds = staffProjectIds.length > 0 ? staffProjectIds : projectId ? [projectId] : [];
    for (const pid of targetProjectIds) {
      await addProjectMember(pid, row.id);
    }
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
  const requestedProjectIds =
    input.projectIds !== undefined
      ? [...new Set(input.projectIds.map((id) => id.trim()).filter(Boolean))]
      : undefined;
  let nextAi = row.aiEnabled;

  if (!nextFullName) throw new Error("Họ tên không được để trống.");
  await assertEmailAvailable(nextEmail, row.id);

  if (actor.role === "PARTNER_ADMIN") {
    nextPartnerId = actor.appUserId ?? row.partnerId;
    nextAi = false;
    if (nextRole !== "STAFF") throw new Error("Chỉ quản lý được nhân viên của bạn.");
  }

  let desiredStaffProjectIds: string[] | undefined;
  if (row.role === "PARTNER_ADMIN" && nextRole !== "PARTNER_ADMIN") {
    const [staffCountRow] = await db
      .select({ n: count() })
      .from(appUsers)
      .where(and(eq(appUsers.partnerId, row.id), eq(appUsers.role, "STAFF")));
    if (Number(staffCountRow?.n ?? 0) > 0) {
      throw new Error("Không thể đổi vai trò sang nhân viên khi tài khoản này đang quản lý nhân viên cấp dưới.");
    }
  }
  if (nextRole === "STAFF" && nextPartnerId) {
    if (actor.role === "SUPER_ADMIN") {
      rejectNewSuperAdmin(row.role, nextRole);
      await assertPartner(nextPartnerId);
    }
    const [partnerRows, partnerMemberships] = await Promise.all([
      db.select({ projectId: appUsers.projectId }).from(appUsers).where(eq(appUsers.id, nextPartnerId)).limit(1),
      db.select({ projectId: projectMembers.projectId }).from(projectMembers).where(eq(projectMembers.userId, nextPartnerId)),
    ]);
    const partnerPrimary = partnerRows[0]?.projectId ?? null;
    const partnerProjectIds = [
      ...new Set([
        ...(partnerPrimary ? [partnerPrimary] : []),
        ...partnerMemberships.map((m) => m.projectId),
      ]),
    ];
    if (requestedProjectIds !== undefined) {
      const allowed =
        partnerProjectIds.length > 0
          ? requestedProjectIds.filter((id) => partnerProjectIds.includes(id))
          : requestedProjectIds;
      desiredStaffProjectIds = allowed.length > 0 ? allowed : partnerProjectIds;
      nextProjectId = desiredStaffProjectIds[0] ?? partnerPrimary ?? null;
    } else if (!nextProjectId || nextPartnerId !== row.partnerId) {
      nextProjectId = partnerPrimary ?? partnerProjectIds[0] ?? null;
    }
  } else if (actor.role === "SUPER_ADMIN") {
    rejectNewSuperAdmin(row.role, nextRole);
    if (nextRole === "STAFF") {
      throw new Error("Nhân viên phải thuộc một partner admin.");
    }
    if (nextRole === "PARTNER_ADMIN") {
      nextPartnerId = null;
      if (requestedProjectIds !== undefined) {
        nextProjectId = requestedProjectIds[0] ?? input.projectId ?? null;
      } else if (input.projectId !== undefined) {
        nextProjectId = input.projectId;
      }
      if (!nextProjectId) throw new Error("Partner admin phải thuộc ít nhất một dự án.");
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

  const emailChanged = nextEmail !== row.email;

  await db
    .update(appUsers)
    .set({
      fullName: nextFullName,
      email: nextEmail,
      ...(emailChanged ? { authUserId: null } : {}),
      role: nextRole,
      partnerId: nextPartnerId,
      projectId: nextProjectId,
      aiEnabled: nextRole === "PARTNER_ADMIN" ? nextAi : false,
      active: nextActive,
    })
    .where(eq(appUsers.id, row.id));

  if (actor.role === "SUPER_ADMIN" && nextRole === "PARTNER_ADMIN" && input.pageIds) {
    const allowedProjIds =
      requestedProjectIds !== undefined && requestedProjectIds.length > 0
        ? [...new Set([...(nextProjectId ? [nextProjectId] : []), ...requestedProjectIds])]
        : nextProjectId
          ? [nextProjectId]
          : [];
    await replacePageGrants(row.id, input.pageIds, allowedProjIds);
  }
  if (nextRole !== "PARTNER_ADMIN") {
    await db.delete(userFacebookPages).where(eq(userFacebookPages.userId, row.id));
  }

  if (nextRole === "PARTNER_ADMIN" && nextProjectId) {
    if (requestedProjectIds !== undefined) {
      const desired = [...new Set([nextProjectId, ...requestedProjectIds])];
      const currentMemberships = await db
        .select({ projectId: projectMembers.projectId })
        .from(projectMembers)
        .where(eq(projectMembers.userId, row.id));
      const existingIds = new Set([
        ...(row.projectId ? [row.projectId] : []),
        ...currentMemberships.map((m) => m.projectId),
      ]);
      for (const oldPid of existingIds) {
        if (!desired.includes(oldPid)) {
          await removePartnerAndStaffFromProject(row.id, oldPid);
        }
      }
      for (const pid of desired) {
        await addProjectMember(pid, row.id);
      }
      await db.update(appUsers).set({ projectId: nextProjectId }).where(eq(appUsers.id, row.id));

      // Đảm bảo nhân viên cấp dưới của partner này nếu bị gỡ hết dự án cũ thì tự động gán về dự án còn lại của partner
      const staffRows = await db
        .select({ id: appUsers.id })
        .from(appUsers)
        .where(and(eq(appUsers.partnerId, row.id), eq(appUsers.role, "STAFF")));
      if (staffRows.length > 0) {
        const staffIds = staffRows.map((s) => s.id);
        const remainingStaffMemberships = await db
          .select({ userId: projectMembers.userId, projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(inArray(projectMembers.userId, staffIds));
        const validByStaff = new Map<string, string[]>();
        for (const m of remainingStaffMemberships) {
          if (desired.includes(m.projectId)) {
            const list = validByStaff.get(m.userId) ?? [];
            list.push(m.projectId);
            validByStaff.set(m.userId, list);
          }
        }
        for (const sId of staffIds) {
          const valid = validByStaff.get(sId) ?? [];
          if (valid.length === 0) {
            await addProjectMember(nextProjectId, sId);
            await db.update(appUsers).set({ projectId: nextProjectId }).where(eq(appUsers.id, sId));
          }
        }
      }
    } else {
      if (row.projectId && row.projectId !== nextProjectId) {
        await removePartnerAndStaffFromProject(row.id, row.projectId);
      }
      await assignPartnerAndStaffToProject(row.id, nextProjectId);
    }
  } else if (nextRole === "STAFF") {
    if (desiredStaffProjectIds !== undefined) {
      await db.delete(projectMembers).where(eq(projectMembers.userId, row.id));
      for (const pid of desiredStaffProjectIds) {
        await addProjectMember(pid, row.id);
      }
    } else if (row.partnerId !== nextPartnerId || row.role !== "STAFF") {
      await db.delete(projectMembers).where(eq(projectMembers.userId, row.id));
      if (nextPartnerId) {
        const partnerMemberships = await db
          .select({ projectId: projectMembers.projectId })
          .from(projectMembers)
          .where(eq(projectMembers.userId, nextPartnerId));
        const targetPids = [
          ...new Set([
            ...(nextProjectId ? [nextProjectId] : []),
            ...partnerMemberships.map((m) => m.projectId),
          ]),
        ];
        for (const pid of targetPids) {
          await addProjectMember(pid, row.id);
        }
      }
    } else {
      if (row.projectId && row.projectId !== nextProjectId) {
        await removeProjectMember(row.projectId, row.id);
      }
      if (nextProjectId) {
        await addProjectMember(nextProjectId, row.id);
      }
    }
  }

  const users = await listManagedUsers(actor);
  const updated = users.find((user) => user.id === row.id);
  if (!updated) throw new Error("Cập nhật thất bại.");
  return updated;
}
