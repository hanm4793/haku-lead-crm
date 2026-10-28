import { eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { ensureDiscoveredFacebookPages } from "@/lib/db/facebook-pages-repo";
import { metaAdInsights, metaSyncRuns } from "@/lib/db/schema";

import { pageLabelFromCampaigns } from "@/lib/marketing/insights-view";
import { pageIdFromCreative, type AdCreative } from "./ad-page";
import { listAccessibleAdAccounts } from "./custom-audiences";
import { getFacebookConfig, normalizeAdAccountId } from "./env";
import { FacebookGraphError, graphGetAllData } from "./graph-client";

export interface SyncInsightsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
  runId: string;
  since: string;
  until: string;
  /** Danh sách TKQC đã đồng bộ thành công. */
  syncedAdAccounts?: string[];
}

type ActionValue = {
  action_type?: string;
  value?: string;
};

type FacebookInsight = {
  campaign_id?: string;
  campaign_name?: string;
  adset_id?: string;
  adset_name?: string;
  ad_id?: string;
  ad_name?: string;
  date_start?: string;
  date_stop?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  reach?: string;
  actions?: ActionValue[];
  cpc?: string;
  cpm?: string;
  ctr?: string;
  cost_per_action_type?: ActionValue[];
};

type FacebookAdCatalogItem = {
  id?: string;
  creative?: AdCreative | null;
};

const METRIC_FIELDS = "spend,impressions,clicks,reach,actions,cpc,cpm,ctr,cost_per_action_type";
const CAMPAIGN_FIELDS = `campaign_id,campaign_name,${METRIC_FIELDS}`;
const AD_FIELDS = `ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name,${METRIC_FIELDS}`;
const INSIGHT_LIMIT = "500";
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PREFERRED_LEAD_ACTIONS = [
  "lead",
  "onsite_conversion.lead_grouped",
  "onsite_conversion.messaging_lead",
  "offsite_conversion.fb_pixel_lead",
];

function toUtcDateString(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function parseUtcDate(value: string): Date | null {
  if (!DATE_PATTERN.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(parsed.getTime()) && toUtcDateString(parsed) === value ? parsed : null;
}

function resolveRange(options?: { since?: string; until?: string }) {
  const until = options?.until ?? toUtcDateString(new Date());
  const untilDate = parseUtcDate(until);
  if (!untilDate) throw new Error("Ngày kết thúc Insights không hợp lệ.");

  const defaultSince = new Date(untilDate);
  defaultSince.setUTCDate(defaultSince.getUTCDate() - 89);
  const since = options?.since ?? toUtcDateString(defaultSince);
  const sinceDate = parseUtcDate(since);
  if (!sinceDate) throw new Error("Ngày bắt đầu Insights không hợp lệ.");
  if (sinceDate > untilDate) throw new Error("Ngày bắt đầu Insights phải trước ngày kết thúc.");

  return { since, until };
}

function optionalText(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

function finiteNumber(value: string | undefined): number | null {
  if (value == null || value.trim() === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function integer(value: string | undefined): number | null {
  const parsed = finiteNumber(value);
  return parsed !== null && Number.isInteger(parsed) ? parsed : null;
}

function isLeadAction(actionType: string): boolean {
  return (
    PREFERRED_LEAD_ACTIONS.includes(actionType) ||
    /(?:^|[._])lead(?:s|_grouped)?$/.test(actionType) ||
    actionType.includes("messaging_lead")
  );
}

function canonicalLeadAction(values: ActionValue[] | undefined) {
  if (!values) return null;
  for (const preferred of PREFERRED_LEAD_ACTIONS) {
    for (const item of values) {
      if (item.action_type !== preferred) continue;
      const value = finiteNumber(item.value);
      if (value !== null) return { actionType: preferred, value };
    }
  }
  for (const item of values) {
    const actionType = item.action_type;
    if (!actionType || !isLeadAction(actionType)) continue;
    const value = finiteNumber(item.value);
    if (value !== null) return { actionType, value };
  }
  return null;
}

function matchingLeadCost(values: ActionValue[] | undefined, actionType: string): number | null {
  if (!values) return null;
  for (const item of values) {
    if (item.action_type !== actionType) continue;
    const value = finiteNumber(item.value);
    if (value !== null) return value;
  }
  return null;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown Insights sync error";
}

function metricValues(row: FacebookInsight) {
  const leadAction = canonicalLeadAction(row.actions);
  return {
    dateStop: row.date_stop ? parseUtcDate(row.date_stop) : null,
    spend: finiteNumber(row.spend),
    impressions: integer(row.impressions),
    clicks: integer(row.clicks),
    reach: integer(row.reach),
    leads: leadAction ? Math.round(leadAction.value) : null,
    cpc: finiteNumber(row.cpc),
    cpm: finiteNumber(row.cpm),
    ctr: finiteNumber(row.ctr),
    costPerLead: leadAction ? matchingLeadCost(row.cost_per_action_type, leadAction.actionType) : null,
    syncedAt: new Date(),
  };
}

async function loadPageByAdId(adAccountId: string, adIds?: string[]): Promise<Map<string, string>> {
  const uniqueIds = adIds ? [...new Set(adIds.filter(Boolean))] : [];
  if (adIds && uniqueIds.length === 0) return new Map();

  const pages = new Map<string, string>();
  const chunks: Array<string[] | null> =
    uniqueIds.length > 0
      ? Array.from({ length: Math.ceil(uniqueIds.length / 100) }, (_, i) =>
          uniqueIds.slice(i * 100, (i + 1) * 100),
        )
      : [null];

  for (const chunk of chunks) {
    const ads = await withGraphRetry(() =>
      graphGetAllData<FacebookAdCatalogItem>(`/${adAccountId}/ads`, {
        fields: "id,creative{actor_id,effective_object_story_id,object_story_spec}",
        limit: "200",
        ...(chunk
          ? { filtering: JSON.stringify([{ field: "id", operator: "IN", value: chunk }]) }
          : {}),
      }),
    );
    for (const ad of ads) {
      const adId = optionalText(ad.id);
      const pageId = pageIdFromCreative(ad.creative);
      if (adId && pageId) pages.set(adId, pageId);
    }
  }
  return pages;
}

function dateWindows(since: string, until: string, days: number) {
  const windows: { since: string; until: string }[] = [];
  let cursor: Date | null = parseUtcDate(since);
  const end = parseUtcDate(until);
  if (!cursor || !end) return [{ since, until }];
  while (cursor <= end) {
    const windowEnd: Date = new Date(cursor);
    windowEnd.setUTCDate(windowEnd.getUTCDate() + days - 1);
    const untilDate: Date = windowEnd > end ? end : windowEnd;
    windows.push({ since: toUtcDateString(cursor), until: toUtcDateString(untilDate) });
    const next: Date = new Date(untilDate);
    next.setUTCDate(next.getUTCDate() + 1);
    cursor = next;
  }
  return windows;
}

async function withGraphRetry<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (error) {
    if (!(error instanceof FacebookGraphError) || (error.code !== 1 && error.status < 500)) throw error;
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return request();
  }
}

/**
 * Đồng bộ Insights cho **1 tài khoản quảng cáo**.
 * Ghi `adAccountId` vào mỗi row `meta_ad_insights`.
 */
async function syncInsightsForAccount(
  adAccountId: string,
  since: string,
  until: string,
): Promise<{ imported: number; updated: number; skipped: number; errors: number; errorMessages: string[] }> {
  const db = getDb();
  const counts = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const errorMessages: string[] = [];

  const windows = dateWindows(since, until, 7);
  const campaignRows: FacebookInsight[] = [];
  const adRows: FacebookInsight[] = [];
  await Promise.all([
    (async () => {
      for (const window of windows) {
        const chunk = await withGraphRetry(() =>
          graphGetAllData<FacebookInsight>(`/${adAccountId}/insights`, {
            level: "campaign",
            time_increment: "1",
            time_range: JSON.stringify(window),
            limit: INSIGHT_LIMIT,
            fields: CAMPAIGN_FIELDS,
          }),
        );
        campaignRows.push(...chunk);
      }
    })(),
    (async () => {
      for (const window of windows) {
        const chunk = await withGraphRetry(() =>
          graphGetAllData<FacebookInsight>(`/${adAccountId}/insights`, {
            level: "ad",
            time_increment: "1",
            time_range: JSON.stringify(window),
            limit: INSIGHT_LIMIT,
            fields: AD_FIELDS,
          }),
        );
        adRows.push(...chunk);
      }
    })(),
  ]);

  let pageByAd = new Map<string, string>();
  try {
    const activeAdIds = adRows.map((r) => optionalText(r.ad_id)).filter((id): id is string => id !== null);
    pageByAd = await loadPageByAdId(adAccountId, activeAdIds);
  } catch (error) {
    counts.errors += 1;
    errorMessages.push(errorMessage(error));
  }
  try {
    const campsByPage = new Map<string, Array<string | null>>();
    for (const r of adRows) {
      const pid = r.ad_id ? pageByAd.get(r.ad_id) : undefined;
      if (!pid || !r.campaign_name) continue;
      const list = campsByPage.get(pid) ?? [];
      list.push(r.campaign_name);
      campsByPage.set(pid, list);
    }
    const fallbackNames = new Map<string, string>();
    for (const [pid, names] of campsByPage.entries()) {
      const label = pageLabelFromCampaigns(names);
      if (label) fallbackNames.set(pid, label);
    }
    await ensureDiscoveredFacebookPages([...pageByAd.values()], undefined, fallbackNames);
  } catch {
    // Tên fanpage chỉ để hiển thị. Thiếu tên không làm hỏng số liệu ads.
  }

  const writes: Array<typeof metaAdInsights.$inferInsert> = [];
  for (const row of campaignRows) {
    const objectId = optionalText(row.campaign_id);
    const dateStart = row.date_start ? parseUtcDate(row.date_start) : null;
    if (!objectId || !dateStart) {
      counts.skipped += 1;
      continue;
    }
    const objectName = optionalText(row.campaign_name);
    writes.push({
      adAccountId,
      level: "campaign",
      objectId,
      objectName,
      campaignId: objectId,
      campaignName: objectName,
      adsetId: null,
      adsetName: null,
      pageId: null,
      dateStart,
      ...metricValues(row),
    });
  }
  for (const row of adRows) {
    const objectId = optionalText(row.ad_id);
    const dateStart = row.date_start ? parseUtcDate(row.date_start) : null;
    if (!objectId || !dateStart) {
      counts.skipped += 1;
      continue;
    }
    writes.push({
      adAccountId,
      level: "ad",
      objectId,
      objectName: optionalText(row.ad_name),
      campaignId: optionalText(row.campaign_id),
      campaignName: optionalText(row.campaign_name),
      adsetId: optionalText(row.adset_id),
      adsetName: optionalText(row.adset_name),
      pageId: pageByAd.get(objectId) ?? null,
      dateStart,
      ...metricValues(row),
    });
  }

  // Khử trùng lặp theo khóa chính (adAccountId, level, objectId, dateStart) trước khi bulk upsert
  const uniqueWritesMap = new Map<string, typeof metaAdInsights.$inferInsert>();
  for (const w of writes) {
    const key = `${w.adAccountId}:${w.level}:${w.objectId}:${w.dateStart.toISOString()}`;
    uniqueWritesMap.set(key, w);
  }
  const uniqueWrites = [...uniqueWritesMap.values()];

  const BATCH_SIZE = 200;
  for (let i = 0; i < uniqueWrites.length; i += BATCH_SIZE) {
    const batch = uniqueWrites.slice(i, i + BATCH_SIZE);
    try {
      const upsertedRows = await db
        .insert(metaAdInsights)
        .values(batch)
        .onConflictDoUpdate({
          target: [
            metaAdInsights.adAccountId,
            metaAdInsights.level,
            metaAdInsights.objectId,
            metaAdInsights.dateStart,
          ],
          set: {
            objectName: sql`excluded.object_name`,
            campaignId: sql`excluded.campaign_id`,
            campaignName: sql`excluded.campaign_name`,
            adsetId: sql`excluded.adset_id`,
            adsetName: sql`excluded.adset_name`,
            pageId: sql`excluded.page_id`,
            dateStop: sql`excluded.date_stop`,
            spend: sql`excluded.spend`,
            impressions: sql`excluded.impressions`,
            clicks: sql`excluded.clicks`,
            reach: sql`excluded.reach`,
            leads: sql`excluded.leads`,
            cpc: sql`excluded.cpc`,
            cpm: sql`excluded.cpm`,
            ctr: sql`excluded.ctr`,
            costPerLead: sql`excluded.cost_per_lead`,
            syncedAt: sql`excluded.synced_at`,
          },
        })
        .returning({ inserted: sql<boolean>`(xmax = 0)` });

      for (const row of upsertedRows) {
        if (row.inserted) counts.imported += 1;
        else counts.updated += 1;
      }
    } catch (error) {
      counts.errors += 1;
      if (errorMessages.length < 5) errorMessages.push(errorMessage(error));
    }
  }

  return { ...counts, errorMessages };
}

/**
 * Đồng bộ Insights cho tất cả TKQC Meta mà token có quyền (cùng Business).
 * Nếu truyền `adAccountIds` thì chỉ sync các TKQC được chỉ định.
 * Nếu không truyền, tự động phát hiện tất cả TKQC accessible qua `GET /me/adaccounts`.
 */
export async function syncFacebookInsights(options?: {
  since?: string;
  until?: string;
  /** Chỉ sync các TKQC được liệt kê. Nếu bỏ trống: sync tất cả TKQC accessible. */
  adAccountIds?: string[];
}): Promise<SyncInsightsResult> {
  const config = getFacebookConfig();
  if (!config) throw new Error("Facebook Graph is not configured");

  const { since, until } = resolveRange(options);
  const db = getDb();
  const [run] = await db
    .insert(metaSyncRuns)
    .values({
      kind: "insights",
      status: "error",
      message: `Facebook Insights sync started for ${since} to ${until}.`,
    })
    .returning({ id: metaSyncRuns.id });

  if (!run) throw new Error("Could not create Facebook Insights sync run");

  const totals = { imported: 0, updated: 0, skipped: 0, errors: 0 };
  const allErrors: string[] = [];
  const syncedAdAccounts: string[] = [];

  try {
    // Xác định danh sách TKQC cần sync
    let targetAccountIds: string[];
    if (options?.adAccountIds && options.adAccountIds.length > 0) {
      targetAccountIds = options.adAccountIds.map((id) => normalizeAdAccountId(id)).filter((id): id is string => id !== null);
    } else {
      // Tự động phát hiện tất cả TKQC accessible
      try {
        const accessible = await listAccessibleAdAccounts();
        targetAccountIds = accessible.map((acc) => acc.id);
      } catch {
        // Fallback về env var nếu không list được
        if (!config.adAccountId) throw new Error("Thiếu FACEBOOK_AD_ACCOUNT_ID và không thể liệt kê TKQC.");
        targetAccountIds = [config.adAccountId];
      }
    }

    if (targetAccountIds.length === 0) {
      throw new Error("Không tìm thấy Tài khoản Quảng cáo Meta nào để đồng bộ.");
    }

    // Sync song song theo cụm 4 TKQC cùng lúc để tối ưu thời gian (< 10s cho 8 TKQC)
    const ACCOUNT_CONCURRENCY = 4;
    for (let i = 0; i < targetAccountIds.length; i += ACCOUNT_CONCURRENCY) {
      const accountBatch = targetAccountIds.slice(i, i + ACCOUNT_CONCURRENCY);
      await Promise.all(
        accountBatch.map(async (accountId) => {
          try {
            const result = await syncInsightsForAccount(accountId, since, until);
            totals.imported += result.imported;
            totals.updated += result.updated;
            totals.skipped += result.skipped;
            totals.errors += result.errors;
            allErrors.push(...result.errorMessages);
            syncedAdAccounts.push(accountId);
          } catch (error) {
            totals.errors += 1;
            if (allErrors.length < 10) {
              allErrors.push(`[${accountId}] ${errorMessage(error)}`);
            }
          }
        }),
      );
    }

    const summary = `Synced ${syncedAdAccounts.length}/${targetAccountIds.length} TKQC. Imported ${totals.imported}, updated ${totals.updated}, skipped ${totals.skipped}, errors ${totals.errors}.`;
    const message = allErrors.length ? `${summary} Error details: ${allErrors.join("; ")}` : summary;
    await db
      .update(metaSyncRuns)
      .set({
        status: totals.errors === 0 || totals.imported + totals.updated > 0 ? "ok" : "error",
        finishedAt: new Date(),
        ...totals,
        message,
      })
      .where(eq(metaSyncRuns.id, run.id));

    return { ...totals, message, runId: run.id, since, until, syncedAdAccounts };
  } catch (error) {
    await db
      .update(metaSyncRuns)
      .set({
        status: "error",
        finishedAt: new Date(),
        ...totals,
        message: errorMessage(error),
      })
      .where(eq(metaSyncRuns.id, run.id));
    throw error;
  }
}
