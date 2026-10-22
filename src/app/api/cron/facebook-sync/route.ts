import { timingSafeEqual } from "node:crypto";
import { and, desc, eq, isNotNull } from "drizzle-orm";
import { revalidatePath } from "next/cache";
import { NextResponse, type NextRequest } from "next/server";

import { canSyncFacebook } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import { metaSyncRuns } from "@/lib/db/schema";
import { getFacebookConfig, isFacebookTokenConfigured } from "@/lib/facebook/env";
import { syncFacebookInsights, type SyncInsightsResult } from "@/lib/facebook/sync-insights";
import { syncFacebookLeads, type SyncLeadsResult } from "@/lib/facebook/sync-leads";

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

async function getLastSuccessAt(kind: "leads" | "insights"): Promise<Date | null> {
  if (!isDatabaseConfigured()) return null;
  const db = getDb();
  const rows = await db
    .select({ finishedAt: metaSyncRuns.finishedAt })
    .from(metaSyncRuns)
    .where(
      and(
        eq(metaSyncRuns.kind, kind),
        eq(metaSyncRuns.status, "ok"),
        isNotNull(metaSyncRuns.finishedAt),
      ),
    )
    .orderBy(desc(metaSyncRuns.finishedAt))
    .limit(1);

  return rows[0]?.finishedAt ?? null;
}

function recentEnough(lastAt: Date | null, minIntervalMinutes: number): boolean {
  if (!lastAt || minIntervalMinutes <= 0) return false;
  const elapsedMs = Date.now() - lastAt.getTime();
  return elapsedMs >= 0 && elapsedMs < minIntervalMinutes * 60_000;
}

function rollingSinceDate(daysBack: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - daysBack);
  return d.toISOString().slice(0, 10);
}

async function handleSync(request: NextRequest) {
  const cronAuthorized = isValidCronSecret(request);
  if (!cronAuthorized) {
    const viewer = await getScopedViewer();
    if (!viewer || !canSyncFacebook(viewer.role)) {
      return NextResponse.json({ ok: false, error: "Forbidden" }, { status: 403 });
    }
  }

  if (!isDatabaseConfigured()) {
    return NextResponse.json({ ok: false, error: "Chưa cấu hình DATABASE_URL." }, { status: 400 });
  }

  const { searchParams } = new URL(request.url);
  const kindParam = (searchParams.get("kind") ?? "all").toLowerCase();
  const force = searchParams.get("force") === "1" || searchParams.get("force") === "true";
  const minInterval = Math.max(0, Number(searchParams.get("minInterval") ?? (force ? 0 : 15)) || 0);

  const shouldRunLeads = kindParam === "all" || kindParam === "leads";
  const shouldRunInsights = kindParam === "all" || kindParam === "insights";

  const tokenOk = isFacebookTokenConfigured();
  const fbConfig = getFacebookConfig();
  void fbConfig;
  // Auto-discovery: chỉ cần token là đủ, không cần adAccountId env var nữa
  const insightsOk = tokenOk;

  let leadsOutcome:
    | { status: "synced"; result: SyncLeadsResult }
    | { status: "skipped"; reason: string }
    | { status: "error"; error: string } = { status: "skipped", reason: "not_requested" };

  let insightsOutcome:
    | { status: "synced"; result: SyncInsightsResult }
    | { status: "skipped"; reason: string }
    | { status: "error"; error: string } = { status: "skipped", reason: "not_requested" };

  let didSyncAny = false;

  if (shouldRunInsights) {
    if (!tokenOk || !insightsOk) {
      insightsOutcome = { status: "skipped", reason: "missing_ad_account_or_token" };
    } else {
      const lastInsightAt = await getLastSuccessAt("insights").catch(() => null);
      if (!force && recentEnough(lastInsightAt, minInterval)) {
        insightsOutcome = { status: "skipped", reason: "recently_synced" };
      } else {
        try {
          // Tự động đồng bộ dùng cửa sổ 3 ngày gần nhất (hôm nay + 2 ngày trước) để chạy nhanh (<8s); bấm thủ công (force=1) quét đủ 30 ngày
          const since = force ? undefined : rollingSinceDate(2);
          const result = await syncFacebookInsights(since ? { since } : undefined);
          insightsOutcome = { status: "synced", result };
          didSyncAny = true;
        } catch (err) {
          insightsOutcome = {
            status: "error",
            error: err instanceof Error ? err.message : "Lỗi đồng bộ Insights.",
          };
        }
      }
    }
  }

  if (shouldRunLeads) {
    if (!tokenOk) {
      leadsOutcome = { status: "skipped", reason: "missing_token" };
    } else {
      const lastLeadAt = await getLastSuccessAt("leads").catch(() => null);
      if (!force && recentEnough(lastLeadAt, minInterval)) {
        leadsOutcome = { status: "skipped", reason: "recently_synced" };
      } else {
        try {
          const result = await syncFacebookLeads(force ? undefined : { recentDays: 3 });
          leadsOutcome = { status: "synced", result };
          didSyncAny = true;
        } catch (err) {
          leadsOutcome = {
            status: "error",
            error: err instanceof Error ? err.message : "Lỗi đồng bộ Lead Facebook.",
          };
        }
      }
    }
  }

  if (didSyncAny) {
    revalidatePath("/leads");
    revalidatePath("/marketing");
    revalidatePath("/reports");
    revalidatePath("/settings");
  }

  return NextResponse.json({
    ok: true,
    didSyncAny,
    syncedAt: new Date().toISOString(),
    leads: leadsOutcome,
    insights: insightsOutcome,
  });
}

export async function GET(request: NextRequest) {
  return handleSync(request);
}

export async function POST(request: NextRequest) {
  return handleSync(request);
}
