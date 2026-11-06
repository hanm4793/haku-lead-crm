import webpush from "web-push";
import { and, eq, gte, inArray, isNotNull, lte, notInArray, or, sql, type SQL } from "drizzle-orm";

import { canReceiveLeadPush, canReceiveNewFacebookLeadPush } from "@/lib/auth/roles";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { dueTodaySql, overdueSql } from "@/lib/db/leads-repo";
import {
  claimPushDedupeKey,
  deleteExpiredEndpoint,
  listActivePushRecipients,
  pruneOldPushLogs,
  type PushRecipientContext,
  type PushSubscriptionRecord,
} from "@/lib/db/push-repo";
import { leads } from "@/lib/db/schema";
import {
  extractMentionedUserIds,
  formatVnClockTime,
  resolveDailyDigestWindow,
  type DailyDigestSlot,
} from "@/lib/push/helpers";

export interface PushMessagePayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
  requireInteraction?: boolean;
}

let vapidInitialized = false;

export function getVapidPublicKey(): string {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY?.trim() ?? "";
}

export function isWebPushConfigured(): boolean {
  const pub = getVapidPublicKey();
  const priv = process.env.VAPID_PRIVATE_KEY?.trim() ?? "";
  return Boolean(pub && priv);
}

function ensureVapidConfigured(): boolean {
  if (!isWebPushConfigured()) return false;
  if (!vapidInitialized) {
    const subject = process.env.VAPID_SUBJECT?.trim() || "mailto:admin@semtop.vn";
    webpush.setVapidDetails(
      subject,
      getVapidPublicKey(),
      process.env.VAPID_PRIVATE_KEY!.trim(),
    );
    vapidInitialized = true;
  }
  return true;
}

export async function sendPushToSubscriptions(
  subs: readonly PushSubscriptionRecord[],
  payload: PushMessagePayload,
): Promise<{ sent: number; failed: number; expiredRemoved: number }> {
  if (!ensureVapidConfigured() || subs.length === 0) {
    return { sent: 0, failed: 0, expiredRemoved: 0 };
  }

  const serialized = JSON.stringify({
    title: payload.title,
    body: payload.body,
    url: payload.url ?? "/leads",
    tag: payload.tag ?? "crm-push",
    requireInteraction: Boolean(payload.requireInteraction),
  });

  let sent = 0;
  let failed = 0;
  let expiredRemoved = 0;

  await Promise.all(
    subs.map(async (sub) => {
      try {
        await webpush.sendNotification(
          {
            endpoint: sub.endpoint,
            keys: {
              p256dh: sub.p256dh,
              auth: sub.auth,
            },
          },
          serialized,
          {
            TTL: 86_400,
            urgency: "high",
          },
        );
        sent += 1;
      } catch (err) {
        const statusCode =
          typeof err === "object" && err !== null && "statusCode" in err
            ? Number((err as { statusCode?: unknown }).statusCode)
            : 0;
        if (statusCode === 404 || statusCode === 410) {
          expiredRemoved += 1;
          await deleteExpiredEndpoint(sub.endpoint).catch(() => undefined);
        } else {
          failed += 1;
          console.error("[web-push] sendNotification failed:", statusCode || err);
        }
      }
    }),
  );

  return { sent, failed, expiredRemoved };
}

/**
 * 1A. Thông báo khi có Lead mới đồng bộ từ Facebook Ads (Form / Inbox / Comment).
 */
export async function notifyNewFacebookLeads(
  items: readonly {
    leadId: string;
    name: string | null;
    phone: string;
    pageId: string;
    pageName?: string | null;
  }[],
): Promise<void> {
  if (!ensureVapidConfigured() || items.length === 0) return;

  const recipients = await listActivePushRecipients();
  if (recipients.length === 0) return;

  await Promise.all(
    recipients.map(async (recipient) => {
      const subs = recipient.subscriptions.filter((s) => s.notifyNewLead);
      if (subs.length === 0) return;

      const visible = items.filter((item) =>
        canReceiveNewFacebookLeadPush(recipient, item.pageId),
      );
      if (visible.length === 0) return;

      if (visible.length === 1) {
        const first = visible[0];
        const customerLabel = first.name?.trim() || "Khách hàng mới";
        const pageSuffix = first.pageName ? ` · ${first.pageName}` : "";
        await sendPushToSubscriptions(subs, {
          title: "🔥 Lead mới từ Facebook",
          body: `${customerLabel} (${first.phone})${pageSuffix}`,
          url: `/leads?leadId=${first.leadId}`,
          tag: `fb-lead-${first.leadId}`,
        });
      } else {
        const previewNames = visible
          .slice(0, 2)
          .map((i) => i.name?.trim() || i.phone)
          .join(", ");
        await sendPushToSubscriptions(subs, {
          title: `🔥 Có ${visible.length} lead mới từ Facebook`,
          body: `${previewNames}${visible.length > 2 ? ` và ${visible.length - 2} khách khác` : ""} — mở CRM để phân bổ ngay.`,
          url: "/leads",
          tag: `fb-leads-batch-${Date.now()}`,
        });
      }
    }),
  );
}

/**
 * 1B. Thông báo khi một Lead được giao cho nhân sự phụ trách.
 */
export async function notifyLeadAssigned(input: {
  leadId: string;
  leadName: string | null;
  leadPhone: string;
  assigneeId: string | null | undefined;
  actorId?: string | null;
  actorName?: string | null;
  facebookPageId?: string | null;
  source?: string | null;
  projectId?: string | null;
}): Promise<void> {
  if (!ensureVapidConfigured()) return;
  if (!input.assigneeId || input.assigneeId === input.actorId) return;

  const recipients = await listActivePushRecipients([input.assigneeId]);
  const recipient = recipients[0];
  if (!recipient) return;

  if (
    !canReceiveLeadPush(recipient, {
      assigneeId: input.assigneeId,
      facebookPageId: input.facebookPageId,
      source: input.source,
      projectId: input.projectId,
    })
  ) {
    return;
  }

  const subs = recipient.subscriptions.filter((s) => s.notifyNewLead);
  if (subs.length === 0) return;

  const customerLabel = input.leadName?.trim() || "Khách hàng";
  const byActor = input.actorName ? ` · Giao bởi ${input.actorName}` : "";

  await sendPushToSubscriptions(subs, {
    title: "📋 Bạn vừa được giao 1 lead mới",
    body: `${customerLabel} (${input.leadPhone})${byActor}`,
    url: `/leads?leadId=${input.leadId}`,
    tag: `assign-${input.leadId}`,
  });
}

/**
 * 1C. Thông báo khi giao hàng loạt lead (Bulk update / Chia tự động Round-Robin).
 */
export async function notifyBulkLeadsAssigned(
  countsByUserId: ReadonlyMap<string, number>,
  actorId?: string | null,
  actorName?: string | null,
): Promise<void> {
  if (!ensureVapidConfigured() || countsByUserId.size === 0) return;

  const targetIds = [...countsByUserId.entries()]
    .filter(([uid, count]) => count > 0 && uid !== actorId)
    .map(([uid]) => uid);

  if (targetIds.length === 0) return;

  const recipients = await listActivePushRecipients(targetIds);
  await Promise.all(
    recipients.map(async (recipient) => {
      const count = countsByUserId.get(recipient.appUserId) ?? 0;
      if (count <= 0) return;
      const subs = recipient.subscriptions.filter((s) => s.notifyNewLead);
      if (subs.length === 0) return;

      const prefix = actorName ? `${actorName} vừa giao` : "Hệ thống vừa phân bổ";
      await sendPushToSubscriptions(subs, {
        title: `📋 Bạn vừa được giao ${count} lead`,
        body: `${prefix} ${count} khách hàng cho bạn. Vào CRM kiểm tra & liên hệ ngay!`,
        url: "/leads",
        tag: `bulk-assign-${recipient.appUserId}-${Date.now()}`,
      });
    }),
  );
}

/**
 * 2. Thông báo khi có `@mention` hoặc bình luận mới trên Lead.
 */
export async function notifyLeadCommentAndMentions(input: {
  lead: {
    id: string;
    name: string | null;
    phone: string;
    assigneeId: string | null;
    facebookPageId: string | null;
    source: string | null;
    projectId: string | null;
  };
  commentContent: string;
  actorId: string;
  actorName: string;
}): Promise<void> {
  if (!ensureVapidConfigured()) return;

  const recipients = await listActivePushRecipients();
  if (recipients.length === 0) return;

  const mentionedIds = new Set(extractMentionedUserIds(input.commentContent, recipients));
  const snippet =
    input.commentContent.trim().length > 90
      ? `${input.commentContent.trim().slice(0, 87)}...`
      : input.commentContent.trim();
  const leadLabel = input.lead.name?.trim() || input.lead.phone;
  const targetUrl = `/leads?leadId=${input.lead.id}&detailTab=comments`;

  await Promise.all(
    recipients.map(async (recipient) => {
      if (recipient.appUserId === input.actorId) return;
      if (!canReceiveLeadPush(recipient, input.lead)) return;

      const subs = recipient.subscriptions.filter((s) => s.notifyMention);
      if (subs.length === 0) return;

      const isMentioned = mentionedIds.has(recipient.appUserId);
      const isAssignee =
        Boolean(input.lead.assigneeId) && input.lead.assigneeId === recipient.appUserId;

      if (!isMentioned && !isAssignee) return;

      await sendPushToSubscriptions(subs, {
        title: isMentioned
          ? `💬 ${input.actorName} đã nhắc đến bạn`
          : `💬 Bình luận mới trên lead ${leadLabel}`,
        body: `${leadLabel}: "${snippet}"`,
        url: targetUrl,
        tag: `comment-${input.lead.id}-${Date.now()}`,
      });
    }),
  );
}

function buildRecipientDigestConditions(recipient: PushRecipientContext): SQL[] | null {
  if (recipient.role === "SUPER_ADMIN") {
    return recipient.projectIds.length > 0
      ? [inArray(leads.projectId, recipient.projectIds)]
      : [];
  }

  if (recipient.projectIds.length === 0) return null;

  const parts: SQL[] = [inArray(leads.projectId, recipient.projectIds)];
  if (recipient.pageIds.length > 0) {
    parts.push(or(inArray(leads.facebookPageId, recipient.pageIds), eq(leads.source, "MANUAL"))!);
  } else {
    parts.push(eq(leads.source, "MANUAL"));
  }

  if (recipient.role === "STAFF") {
    parts.push(eq(leads.assigneeId, recipient.appUserId));
  }

  return parts;
}

async function computeRecipientDigestStats(
  recipient: PushRecipientContext,
  now: Date,
): Promise<{ uncontacted: number; todayCallbacks: number; overdue: number }> {
  const scopeParts = buildRecipientDigestConditions(recipient);
  if (scopeParts === null) {
    return { uncontacted: 0, todayCallbacks: 0, overdue: 0 };
  }

  const db = getDb();
  const baseWhere = scopeParts.length > 0 ? and(...scopeParts) : undefined;

  const [row] = await db
    .select({
      uncontacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'CHUA_LIEN_HE' and ${leads.category} not in ('FAIL', 'KHD'))::int`,
      todayCallbacks: sql<number>`count(*) filter (where ${dueTodaySql(now)})::int`,
      overdue: sql<number>`count(*) filter (where ${overdueSql(now)})::int`,
    })
    .from(leads)
    .where(baseWhere);

  return {
    uncontacted: Number(row?.uncontacted ?? 0),
    todayCallbacks: Number(row?.todayCallbacks ?? 0),
    overdue: Number(row?.overdue ?? 0),
  };
}

export interface ScheduledPushResult {
  configured: boolean;
  callbackNotificationsSent: number;
  digestNotificationsSent: number;
  digestSlot: DailyDigestSlot | null;
}

/**
 * 3 & 4. Cron quét định kỳ mỗi 15 phút:
 * - Nhắc lịch hẹn gọi lại (`callbackAt` trong khoảng [now - 30m, now + 15m]).
 * - Bản tin nhắc vào kiểm tra CRM đều đặn hàng ngày (08:30 sáng & 14:00 chiều giờ VN).
 */
export async function runScheduledPushReminders(options?: {
  now?: Date;
  forceDigestSlot?: DailyDigestSlot;
}): Promise<ScheduledPushResult> {
  if (!ensureVapidConfigured() || !isDatabaseConfigured()) {
    return {
      configured: false,
      callbackNotificationsSent: 0,
      digestNotificationsSent: 0,
      digestSlot: null,
    };
  }

  const now = options?.now ?? new Date();
  const recipients = await listActivePushRecipients();
  if (recipients.length === 0) {
    return {
      configured: true,
      callbackNotificationsSent: 0,
      digestNotificationsSent: 0,
      digestSlot: null,
    };
  }

  const db = getDb();
  let callbackNotificationsSent = 0;
  let digestNotificationsSent = 0;

  // --- PHẦN 1: Nhắc lịch hẹn gọi lại (callbackAt) ---
  const windowFrom = new Date(now.getTime() - 30 * 60 * 1000);
  const windowTo = new Date(now.getTime() + 15 * 60 * 1000);

  const dueLeads = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      callbackAt: leads.callbackAt,
      careNote: leads.careNote,
      assigneeId: leads.assigneeId,
      facebookPageId: leads.facebookPageId,
      source: leads.source,
      projectId: leads.projectId,
    })
    .from(leads)
    .where(
      and(
        isNotNull(leads.callbackAt),
        gte(leads.callbackAt, windowFrom),
        lte(leads.callbackAt, windowTo),
        notInArray(leads.category, ["FAIL", "KHD"]),
      ),
    );

  const recipientById = new Map(recipients.map((r) => [r.appUserId, r]));

  for (const lead of dueLeads) {
    if (!lead.callbackAt) continue;

    const targetRecipients: PushRecipientContext[] = [];
    if (lead.assigneeId) {
      const assigned = recipientById.get(lead.assigneeId);
      if (assigned && canReceiveLeadPush(assigned, lead)) {
        targetRecipients.push(assigned);
      }
    } else {
      for (const r of recipients) {
        if ((r.role === "SUPER_ADMIN" || r.role === "PARTNER_ADMIN") && canReceiveLeadPush(r, lead)) {
          targetRecipients.push(r);
        }
      }
    }

    for (const recipient of targetRecipients) {
      const subs = recipient.subscriptions.filter((s) => s.notifyCallback);
      if (subs.length === 0) continue;

      const dedupeKey = `callback:${lead.id}:${lead.callbackAt.toISOString()}:${recipient.appUserId}`;
      const claimed = await claimPushDedupeKey(dedupeKey, recipient.appUserId, "callback");
      if (!claimed) continue;

      const timeStr = formatVnClockTime(lead.callbackAt);
      const leadLabel = lead.name?.trim() || "Khách hàng";
      const trimmedNote = lead.careNote?.trim() ?? "";
      const noteSnippet = trimmedNote.length > 60 ? `${trimmedNote.slice(0, 57)}...` : trimmedNote;
      const noteSuffix = noteSnippet ? ` — ${noteSnippet}` : "";

      const res = await sendPushToSubscriptions(subs, {
        title: `⏰ Đến hẹn gọi lại lúc ${timeStr}`,
        body: `${leadLabel} (${lead.phone})${noteSuffix}`,
        url: `/leads?leadId=${lead.id}`,
        tag: `callback-${lead.id}`,
        requireInteraction: true,
      });
      callbackNotificationsSent += res.sent;
    }
  }

  // --- PHẦN 2: Bản tin nhắc kiểm tra CRM hàng ngày (08:30 sáng & 14:00 chiều VN) ---
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const fallbackDateKey = `${vnNow.getUTCFullYear()}-${String(vnNow.getUTCMonth() + 1).padStart(2, "0")}-${String(vnNow.getUTCDate()).padStart(2, "0")}`;
  const digestWindow = options?.forceDigestSlot
    ? { dateKey: fallbackDateKey, slot: options.forceDigestSlot }
    : resolveDailyDigestWindow(now);

  if (digestWindow) {
    for (const recipient of recipients) {
      const subs = recipient.subscriptions.filter((s) => s.notifyDailyDigest);
      if (subs.length === 0) continue;

      const stats = await computeRecipientDigestStats(recipient, now);
      const hasWork =
        stats.uncontacted > 0 || stats.todayCallbacks > 0 || stats.overdue > 0;

      // Buổi chiều chỉ nhắc khi còn việc tồn cần xử lý; buổi sáng luôn báo điểm danh mở app đầu ngày
      if (digestWindow.slot === "afternoon" && !hasWork) {
        continue;
      }

      const dedupeKey = `digest:${digestWindow.dateKey}:${digestWindow.slot}:${recipient.appUserId}`;
      const claimed = await claimPushDedupeKey(dedupeKey, recipient.appUserId, "daily_digest");
      if (!claimed) continue;

      const parts: string[] = [];
      if (stats.uncontacted > 0) parts.push(`${stats.uncontacted} chưa liên hệ`);
      if (stats.todayCallbacks > 0) parts.push(`${stats.todayCallbacks} hẹn hôm nay`);
      if (stats.overdue > 0) parts.push(`${stats.overdue} quá hạn`);

      const title =
        digestWindow.slot === "morning"
          ? `☀️ Chào ngày mới, ${recipient.fullName}!`
          : `🔔 Nhắc kiểm tra Lead buổi chiều`;

      const body =
        parts.length > 0
          ? `Cần xử lý: ${parts.join(" · ")}. Chạm để mở CRM làm việc ngay!`
          : "Tất cả lead hiện đã được xử lý gọn gàng. Mở CRM để theo dõi khách mới trong ngày nhé!";

      const res = await sendPushToSubscriptions(subs, {
        title,
        body,
        url: "/leads",
        tag: `daily-digest-${digestWindow.dateKey}-${digestWindow.slot}`,
      });
      digestNotificationsSent += res.sent;
    }
  }

  await pruneOldPushLogs(30).catch(() => undefined);

  return {
    configured: true,
    callbackNotificationsSent,
    digestNotificationsSent,
    digestSlot: digestWindow?.slot ?? null,
  };
}
