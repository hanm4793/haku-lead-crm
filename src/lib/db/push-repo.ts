import { and, asc, eq, inArray, lt } from "drizzle-orm";

import { pageGrantUserId, type UserRole } from "@/lib/auth/roles";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import {
  appUsers,
  facebookPages,
  projectMembers,
  projects,
  pushNotificationLogs,
  pushSubscriptions,
  userFacebookPages,
} from "@/lib/db/schema";

export interface PushPreferenceFlags {
  notifyNewLead: boolean;
  notifyMention: boolean;
  notifyCallback: boolean;
  notifyDailyDigest: boolean;
}

export type PushSubscriptionRecord = typeof pushSubscriptions.$inferSelect;

export interface PushRecipientContext {
  appUserId: string;
  fullName: string;
  email: string | null;
  role: UserRole;
  partnerId: string | null;
  projectId: string | null;
  projectIds: string[];
  pageIds: string[];
  subscriptions: PushSubscriptionRecord[];
}

export async function upsertPushSubscription(
  userId: string,
  input: {
    endpoint: string;
    p256dh: string;
    auth: string;
    userAgent?: string | null;
    preferences?: Partial<PushPreferenceFlags>;
  },
): Promise<PushSubscriptionRecord> {
  const db = getDb();
  const now = new Date();
  const prefPatch: Partial<typeof pushSubscriptions.$inferInsert> = {};
  if (input.preferences?.notifyNewLead !== undefined) {
    prefPatch.notifyNewLead = input.preferences.notifyNewLead;
  }
  if (input.preferences?.notifyMention !== undefined) {
    prefPatch.notifyMention = input.preferences.notifyMention;
  }
  if (input.preferences?.notifyCallback !== undefined) {
    prefPatch.notifyCallback = input.preferences.notifyCallback;
  }
  if (input.preferences?.notifyDailyDigest !== undefined) {
    prefPatch.notifyDailyDigest = input.preferences.notifyDailyDigest;
  }

  const [row] = await db
    .insert(pushSubscriptions)
    .values({
      userId,
      endpoint: input.endpoint,
      p256dh: input.p256dh,
      auth: input.auth,
      userAgent: input.userAgent ?? null,
      notifyNewLead: input.preferences?.notifyNewLead ?? true,
      notifyMention: input.preferences?.notifyMention ?? true,
      notifyCallback: input.preferences?.notifyCallback ?? true,
      notifyDailyDigest: input.preferences?.notifyDailyDigest ?? true,
      updatedAt: now,
    })
    .onConflictDoUpdate({
      target: pushSubscriptions.endpoint,
      set: {
        userId,
        p256dh: input.p256dh,
        auth: input.auth,
        userAgent: input.userAgent ?? null,
        updatedAt: now,
        ...prefPatch,
      },
    })
    .returning();

  return row;
}

export async function getPushSubscriptionByEndpoint(
  userId: string,
  endpoint: string,
): Promise<PushSubscriptionRecord | null> {
  if (!isDatabaseConfigured()) return null;
  const rows = await getDb()
    .select()
    .from(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listUserPushSubscriptions(userId: string): Promise<PushSubscriptionRecord[]> {
  if (!isDatabaseConfigured()) return [];
  return getDb()
    .select()
    .from(pushSubscriptions)
    .where(eq(pushSubscriptions.userId, userId))
    .orderBy(asc(pushSubscriptions.createdAt));
}

export async function updatePushPreferences(
  userId: string,
  endpoint: string | null,
  prefs: Partial<PushPreferenceFlags>,
): Promise<PushSubscriptionRecord[]> {
  const db = getDb();
  const patch: Partial<typeof pushSubscriptions.$inferInsert> = {
    updatedAt: new Date(),
  };
  if (prefs.notifyNewLead !== undefined) patch.notifyNewLead = prefs.notifyNewLead;
  if (prefs.notifyMention !== undefined) patch.notifyMention = prefs.notifyMention;
  if (prefs.notifyCallback !== undefined) patch.notifyCallback = prefs.notifyCallback;
  if (prefs.notifyDailyDigest !== undefined) patch.notifyDailyDigest = prefs.notifyDailyDigest;

  const condition = endpoint
    ? and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint))
    : eq(pushSubscriptions.userId, userId);

  return db.update(pushSubscriptions).set(patch).where(condition).returning();
}

export async function deletePushSubscription(userId: string, endpoint: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDb()
    .delete(pushSubscriptions)
    .where(and(eq(pushSubscriptions.userId, userId), eq(pushSubscriptions.endpoint, endpoint)));
}

export async function deleteExpiredEndpoint(endpoint: string): Promise<void> {
  if (!isDatabaseConfigured()) return;
  await getDb().delete(pushSubscriptions).where(eq(pushSubscriptions.endpoint, endpoint));
}

/**
 * Truy vấn danh sách người dùng đang hoạt động có bật Push Notification kèm đầy đủ phạm vi RBAC (`pageIds`, `projectIds`).
 */
export async function listActivePushRecipients(
  onlyUserIds?: readonly string[],
): Promise<PushRecipientContext[]> {
  if (!isDatabaseConfigured()) return [];
  if (onlyUserIds && onlyUserIds.length === 0) return [];

  const db = getDb();
  const subQueryCondition = onlyUserIds
    ? inArray(pushSubscriptions.userId, [...onlyUserIds])
    : undefined;

  const subs = await db.select().from(pushSubscriptions).where(subQueryCondition);
  if (subs.length === 0) return [];

  const subscriberIds = [...new Set(subs.map((s) => s.userId))];

  const [users, activeProjectRows] = await Promise.all([
    db
      .select()
      .from(appUsers)
      .where(and(inArray(appUsers.id, subscriberIds), eq(appUsers.active, true))),
    db
      .select({ id: projects.id })
      .from(projects)
      .where(eq(projects.active, true)),
  ]);

  if (users.length === 0) return [];

  const activeProjectIdSet = new Set(activeProjectRows.map((p) => p.id));
  const allActiveProjectIds = activeProjectRows.map((p) => p.id);

  const partnerIdsToFetch = [
    ...new Set(
      users
        .map((u) => u.partnerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const pageOwnerIds = [
    ...new Set(
      users
        .map((u) => pageGrantUserId({ role: u.role, id: u.id, partnerId: u.partnerId }))
        .filter((id): id is string => Boolean(id)),
    ),
  ];

  const memberUserIds = [...new Set([...users.map((u) => u.id), ...partnerIdsToFetch])];

  const [pageGrantRows, membershipRows, partnerRows] = await Promise.all([
    pageOwnerIds.length > 0
      ? db
          .select({
            userId: userFacebookPages.userId,
            facebookPageId: userFacebookPages.facebookPageId,
          })
          .from(userFacebookPages)
          .innerJoin(
            facebookPages,
            eq(facebookPages.facebookPageId, userFacebookPages.facebookPageId),
          )
          .where(
            and(
              inArray(userFacebookPages.userId, pageOwnerIds),
              eq(facebookPages.active, true),
            ),
          )
      : Promise.resolve([]),
    memberUserIds.length > 0
      ? db
          .select({
            userId: projectMembers.userId,
            projectId: projectMembers.projectId,
          })
          .from(projectMembers)
          .where(inArray(projectMembers.userId, memberUserIds))
      : Promise.resolve([]),
    partnerIdsToFetch.length > 0
      ? db
          .select({ id: appUsers.id, projectId: appUsers.projectId })
          .from(appUsers)
          .where(inArray(appUsers.id, partnerIdsToFetch))
      : Promise.resolve([]),
  ]);

  const pagesByOwner = new Map<string, string[]>();
  for (const row of pageGrantRows) {
    const arr = pagesByOwner.get(row.userId) ?? [];
    arr.push(row.facebookPageId);
    pagesByOwner.set(row.userId, arr);
  }

  const projectsByUser = new Map<string, string[]>();
  for (const row of membershipRows) {
    const arr = projectsByUser.get(row.userId) ?? [];
    arr.push(row.projectId);
    projectsByUser.set(row.userId, arr);
  }

  const partnerProjectMap = new Map<string, string | null>();
  for (const row of partnerRows) {
    partnerProjectMap.set(row.id, row.projectId);
  }

  const subsByUser = new Map<string, PushSubscriptionRecord[]>();
  for (const sub of subs) {
    const arr = subsByUser.get(sub.userId) ?? [];
    arr.push(sub);
    subsByUser.set(sub.userId, arr);
  }

  return users.map((user) => {
    const userSubs = subsByUser.get(user.id) ?? [];
    if (user.role === "SUPER_ADMIN") {
      return {
        appUserId: user.id,
        fullName: user.fullName,
        email: user.email,
        role: user.role,
        partnerId: user.partnerId,
        projectId: user.projectId,
        projectIds: allActiveProjectIds,
        pageIds: [],
        subscriptions: userSubs,
      };
    }

    const ownerId = pageGrantUserId({
      role: user.role,
      id: user.id,
      partnerId: user.partnerId,
    });
    const pageIds = ownerId ? (pagesByOwner.get(ownerId) ?? []) : [];

    let fallbackProjectId = user.projectId;
    if (user.role === "STAFF" && !fallbackProjectId && user.partnerId) {
      fallbackProjectId = partnerProjectMap.get(user.partnerId) ?? null;
    }

    const ownProjs = projectsByUser.get(user.id) ?? [];
    const partnerProjs =
      user.role === "STAFF" && user.partnerId
        ? (projectsByUser.get(user.partnerId) ?? [])
        : [];
    let rawProjectIds = [...new Set([...ownProjs, ...partnerProjs])];
    if (rawProjectIds.length === 0 && fallbackProjectId) {
      rawProjectIds = [fallbackProjectId];
    }
    const projectIds = rawProjectIds.filter((id) => activeProjectIdSet.has(id));

    return {
      appUserId: user.id,
      fullName: user.fullName,
      email: user.email,
      role: user.role,
      partnerId: user.partnerId,
      projectId: fallbackProjectId,
      projectIds,
      pageIds,
      subscriptions: userSubs,
    };
  });
}

/**
 * Chiếm khóa chống gửi trùng (atomic INSERT ... ON CONFLICT DO NOTHING).
 * Trả về `true` nếu đây là lần đầu gửi khóa này, `false` nếu đã gửi trước đó.
 */
export async function claimPushDedupeKey(
  dedupeKey: string,
  userId: string,
  kind: string,
): Promise<boolean> {
  if (!isDatabaseConfigured()) return false;
  const rows = await getDb()
    .insert(pushNotificationLogs)
    .values({
      dedupeKey,
      userId,
      kind,
    })
    .onConflictDoNothing({ target: pushNotificationLogs.dedupeKey })
    .returning({ id: pushNotificationLogs.id });
  return rows.length > 0;
}

export async function pruneOldPushLogs(daysToKeep = 30): Promise<void> {
  if (!isDatabaseConfigured()) return;
  const cutoff = new Date(Date.now() - daysToKeep * 24 * 60 * 60 * 1000);
  await getDb()
    .delete(pushNotificationLogs)
    .where(lt(pushNotificationLogs.sentAt, cutoff));
}
