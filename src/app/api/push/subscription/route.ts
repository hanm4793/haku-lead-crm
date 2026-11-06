import { NextResponse, type NextRequest } from "next/server";
import { z } from "zod";

import { canUsePushNotifications } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  deletePushSubscription,
  listUserPushSubscriptions,
  updatePushPreferences,
  upsertPushSubscription,
} from "@/lib/db/push-repo";
import {
  getVapidPublicKey,
  isWebPushConfigured,
  sendPushToSubscriptions,
} from "@/lib/push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const subscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
  keys: z.object({
    p256dh: z.string().min(10).max(512),
    auth: z.string().min(6).max(256),
  }),
  userAgent: z.string().max(512).optional().nullable(),
  preferences: z
    .object({
      notifyNewLead: z.boolean().optional(),
      notifyMention: z.boolean().optional(),
      notifyCallback: z.boolean().optional(),
      notifyDailyDigest: z.boolean().optional(),
    })
    .optional(),
});

const patchSchema = z.object({
  endpoint: z.string().url().max(2048).optional().nullable(),
  notifyNewLead: z.boolean().optional(),
  notifyMention: z.boolean().optional(),
  notifyCallback: z.boolean().optional(),
  notifyDailyDigest: z.boolean().optional(),
});

const unsubscribeSchema = z.object({
  endpoint: z.string().url().max(2048),
});

export async function GET(request: NextRequest) {
  const viewer = await getScopedViewer();
  if (!viewer || !canUsePushNotifications(viewer) || !viewer.appUserId) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền sử dụng thông báo đẩy." },
      { status: 403 },
    );
  }

  const endpoint = request.nextUrl.searchParams.get("endpoint")?.trim() || null;
  const subs = isDatabaseConfigured()
    ? await listUserPushSubscriptions(viewer.appUserId)
    : [];

  const matched = endpoint ? subs.find((s) => s.endpoint === endpoint) : null;
  const ref = matched ?? subs[0] ?? null;

  return NextResponse.json({
    ok: true,
    configured: isWebPushConfigured(),
    vapidPublicKey: getVapidPublicKey(),
    deviceCount: subs.length,
    subscribed: Boolean(matched),
    preferences: {
      notifyNewLead: ref?.notifyNewLead ?? true,
      notifyMention: ref?.notifyMention ?? true,
      notifyCallback: ref?.notifyCallback ?? true,
      notifyDailyDigest: ref?.notifyDailyDigest ?? true,
    },
  });
}

export async function POST(request: NextRequest) {
  const viewer = await getScopedViewer();
  if (!viewer || !canUsePushNotifications(viewer) || !viewer.appUserId) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền sử dụng thông báo đẩy." },
      { status: 403 },
    );
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json(
      { ok: false, error: "Chưa cấu hình cơ sở dữ liệu." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  if (
    typeof body === "object" &&
    body !== null &&
    "action" in body &&
    (body as { action?: unknown }).action === "test"
  ) {
    if (!isWebPushConfigured()) {
      return NextResponse.json(
        { ok: false, error: "Chưa cấu hình VAPID key cho Web Push." },
        { status: 400 },
      );
    }
    const targetEndpoint =
      "endpoint" in body && typeof (body as { endpoint?: unknown }).endpoint === "string"
        ? ((body as { endpoint: string }).endpoint.trim() || null)
        : null;

    const allSubs = await listUserPushSubscriptions(viewer.appUserId);
    const subs = targetEndpoint
      ? allSubs.filter((s) => s.endpoint === targetEndpoint)
      : allSubs;
    const effectiveSubs = subs.length > 0 ? subs : allSubs;

    if (effectiveSubs.length === 0) {
      return NextResponse.json(
        { ok: false, error: "Thiết bị chưa bật nhận thông báo. Hãy bật công tắc trước." },
        { status: 400 },
      );
    }

    const res = await sendPushToSubscriptions(effectiveSubs, {
      title: "✅ Thông báo đẩy hoạt động tốt!",
      body: `Xin chào ${viewer.fullName} — thiết bị đã sẵn sàng nhận thông báo Lead mới, @mention, lịch hẹn & báo thức hàng ngày.`,
      url: "/leads",
      tag: `test-push-${Date.now()}`,
    });

    if (res.sent === 0) {
      return NextResponse.json(
        { ok: false, error: "Không gửi được tới thiết bị (phiên đăng ký đã hết hạn, vui lòng bật lại)." },
        { status: 400 },
      );
    }

    return NextResponse.json({ ok: true, sent: res.sent });
  }

  const parsed = subscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Thông tin đăng ký Push không hợp lệ." },
      { status: 400 },
    );
  }

  const record = await upsertPushSubscription(viewer.appUserId, {
    endpoint: parsed.data.endpoint,
    p256dh: parsed.data.keys.p256dh,
    auth: parsed.data.keys.auth,
    userAgent: parsed.data.userAgent ?? request.headers.get("user-agent"),
    preferences: parsed.data.preferences,
  });

  return NextResponse.json({
    ok: true,
    preferences: {
      notifyNewLead: record.notifyNewLead,
      notifyMention: record.notifyMention,
      notifyCallback: record.notifyCallback,
      notifyDailyDigest: record.notifyDailyDigest,
    },
  });
}

export async function PATCH(request: NextRequest) {
  const viewer = await getScopedViewer();
  if (!viewer || !canUsePushNotifications(viewer) || !viewer.appUserId) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền sử dụng thông báo đẩy." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, error: "Cấu hình tùy chọn thông báo không hợp lệ." },
      { status: 400 },
    );
  }

  const updated = await updatePushPreferences(
    viewer.appUserId,
    parsed.data.endpoint ?? null,
    {
      notifyNewLead: parsed.data.notifyNewLead,
      notifyMention: parsed.data.notifyMention,
      notifyCallback: parsed.data.notifyCallback,
      notifyDailyDigest: parsed.data.notifyDailyDigest,
    },
  );

  const ref = updated[0];
  return NextResponse.json({
    ok: true,
    updatedCount: updated.length,
    preferences: ref
      ? {
          notifyNewLead: ref.notifyNewLead,
          notifyMention: ref.notifyMention,
          notifyCallback: ref.notifyCallback,
          notifyDailyDigest: ref.notifyDailyDigest,
        }
      : null,
  });
}

export async function DELETE(request: NextRequest) {
  const viewer = await getScopedViewer();
  if (!viewer || !canUsePushNotifications(viewer) || !viewer.appUserId) {
    return NextResponse.json(
      { ok: false, error: "Bạn không có quyền sử dụng thông báo đẩy." },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Dữ liệu không hợp lệ." }, { status: 400 });
  }

  const parsed = unsubscribeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ ok: false, error: "Endpoint không hợp lệ." }, { status: 400 });
  }

  await deletePushSubscription(viewer.appUserId, parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}
