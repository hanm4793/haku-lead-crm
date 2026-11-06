import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";

import { canTriggerPushCron } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import type { DailyDigestSlot } from "@/lib/push/helpers";
import { runScheduledPushReminders } from "@/lib/push/web-push";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isValidCronSecret(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim();
  if (!secret) return false;
  const authHeader = request.headers.get("authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7).trim() : "";
  if (!token) return false;
  const a = Buffer.from(token);
  const b = Buffer.from(secret);
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

async function handlePushCron(request: NextRequest) {
  const cronAuthorized = isValidCronSecret(request);
  if (!cronAuthorized) {
    const viewer = await getScopedViewer();
    if (!viewer || !canTriggerPushCron(viewer.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chưa cấu hình DATABASE_URL." }, { status: 400 });
  }

  const forceSlotParam = request.nextUrl.searchParams.get("forceDigest");
  const forceDigestSlot: DailyDigestSlot | undefined =
    forceSlotParam === "morning" || forceSlotParam === "afternoon"
      ? forceSlotParam
      : undefined;

  try {
    const result = await runScheduledPushReminders({ forceDigestSlot });
    return NextResponse.json({
      ok: true,
      executedAt: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    return NextResponse.json(
      {
        ok: false,
        error: err instanceof Error ? err.message : "Lỗi chạy nhắc thông báo tự động.",
      },
      { status: 500 },
    );
  }
}

export async function GET(request: NextRequest) {
  return handlePushCron(request);
}

export async function POST(request: NextRequest) {
  return handlePushCron(request);
}
