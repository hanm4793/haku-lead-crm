import { and, asc, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";

import { getDb } from "./client";
import { facebookPages, metaAdInsights, metaSyncRuns } from "./schema";

export type InsightRow = {
  objectId: string;
  objectName: string | null;
  date: string;
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
  costPerLead: number | null;
};

export type AdInsightRow = InsightRow & {
  campaignId: string | null;
  campaignName: string | null;
  adsetId: string | null;
  adsetName: string | null;
  pageId: string | null;
};

export type InsightTotals = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
};

function boundedRange(range: { from: string; to: string }) {
  const from = utcDate(range.from, "Ngày bắt đầu");
  const to = utcDate(range.to, "Ngày kết thúc");
  if (from > to) throw new Error("Ngày bắt đầu phải trước ngày kết thúc.");
  return { from, to };
}

export type InsightSyncSnapshot = {
  status: "ok" | "error";
  finishedAt: string | null;
  message: string | null;
};

export async function latestInsightSync(): Promise<InsightSyncSnapshot | null> {
  const [run] = await getDb()
    .select({
      status: metaSyncRuns.status,
      finishedAt: metaSyncRuns.finishedAt,
      message: metaSyncRuns.message,
    })
    .from(metaSyncRuns)
    .where(eq(metaSyncRuns.kind, "insights"))
    .orderBy(desc(metaSyncRuns.startedAt))
    .limit(1);

  if (!run) return null;
  return {
    status: run.status,
    finishedAt: run.finishedAt ? run.finishedAt.toISOString() : null,
    message: run.message,
  };
}

function utcDate(value: string, label: string): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`${label} không hợp lệ.`);
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`${label} không hợp lệ.`);
  }
  return date;
}

export async function listCampaignInsights(range?: {
  from: string;
  to: string;
}): Promise<InsightRow[]> {
  const bounds = range ? boundedRange(range) : null;
  const rows = await getDb()
    .select({
      objectId: metaAdInsights.objectId,
      objectName: metaAdInsights.objectName,
      dateStart: metaAdInsights.dateStart,
      spend: metaAdInsights.spend,
      impressions: metaAdInsights.impressions,
      clicks: metaAdInsights.clicks,
      leads: metaAdInsights.leads,
      costPerLead: metaAdInsights.costPerLead,
    })
    .from(metaAdInsights)
    .where(
      bounds
        ? and(
            eq(metaAdInsights.level, "campaign"),
            gte(metaAdInsights.dateStart, bounds.from),
            lte(metaAdInsights.dateStart, bounds.to),
          )
        : eq(metaAdInsights.level, "campaign"),
    )
    .orderBy(desc(metaAdInsights.dateStart), asc(metaAdInsights.objectName));

  return rows.map(({ dateStart, ...row }) => ({
    ...row,
    date: dateStart.toISOString().slice(0, 10),
  }));
}

export async function listAdInsights(range?: { from: string; to: string }): Promise<AdInsightRow[]> {
  const bounds = range ? boundedRange(range) : null;
  const rows = await getDb()
    .select({
      objectId: metaAdInsights.objectId,
      objectName: metaAdInsights.objectName,
      campaignId: metaAdInsights.campaignId,
      campaignName: metaAdInsights.campaignName,
      adsetId: metaAdInsights.adsetId,
      adsetName: metaAdInsights.adsetName,
      pageId: metaAdInsights.pageId,
      dateStart: metaAdInsights.dateStart,
      spend: metaAdInsights.spend,
      impressions: metaAdInsights.impressions,
      clicks: metaAdInsights.clicks,
      leads: metaAdInsights.leads,
      costPerLead: metaAdInsights.costPerLead,
    })
    .from(metaAdInsights)
    .where(
      bounds
        ? and(
            eq(metaAdInsights.level, "ad"),
            gte(metaAdInsights.dateStart, bounds.from),
            lte(metaAdInsights.dateStart, bounds.to),
          )
        : eq(metaAdInsights.level, "ad"),
    )
    .orderBy(desc(metaAdInsights.dateStart), asc(metaAdInsights.objectName));

  return rows.map(({ dateStart, ...row }) => ({
    ...row,
    date: dateStart.toISOString().slice(0, 10),
  }));
}

function sumKnown(rows: InsightRow[], key: keyof InsightTotals): number | null {
  let total = 0;
  let known = false;
  for (const row of rows) {
    const value = row[key];
    if (value !== null) {
      total += value;
      known = true;
    }
  }
  return known ? total : null;
}

export function aggregateCampaignInsights(rows: InsightRow[]): InsightTotals {
  return {
    spend: sumKnown(rows, "spend"),
    impressions: sumKnown(rows, "impressions"),
    clicks: sumKnown(rows, "clicks"),
    leads: sumKnown(rows, "leads"),
  };
}

export type MarketingTotals = {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

export type MarketingBreakdownRow = MarketingTotals & {
  key: string;
  id?: string;
  campaignId?: string | null;
  campaignName?: string | null;
  pageId?: string | null;
  adUrl?: string | null;
  crmUrl?: string | null;
};

function insightDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`);
}

function asNumber(value: unknown) {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

/**
 * Tổng quảng cáo cấp ad. `pageIds = null` là toàn bộ tài khoản;
 * mảng rỗng là không có fanpage nào trong phạm vi.
 */
export async function queryMarketingSnapshot(input: {
  from: string | null;
  to: string | null;
  pageIds: string[] | null;
  campaignContains?: string | null;
  campaignIds?: string[] | null;
  adIds?: string[] | null;
  brands?: string[];
  brandOptions?: Array<{ code: string; name: string }>;
  groupBy: "fanpage" | "campaign" | "brand" | "ad" | null;
  rankBy?: "leads" | "spend" | "clicks" | "cpl" | null;
  limit?: number;
}): Promise<{ totals: MarketingTotals; rows: MarketingBreakdownRow[] }> {
  if (input.pageIds && input.pageIds.length === 0) {
    return { totals: { spend: 0, impressions: 0, clicks: 0, leads: 0 }, rows: [] };
  }

  const parts = [eq(metaAdInsights.level, "ad")];
  if (input.from) parts.push(gte(metaAdInsights.dateStart, insightDay(input.from)));
  if (input.to) parts.push(lte(metaAdInsights.dateStart, insightDay(input.to)));
  if (input.pageIds) parts.push(inArray(metaAdInsights.pageId, input.pageIds));
  if (input.campaignIds?.length) parts.push(inArray(metaAdInsights.campaignId, input.campaignIds));
  if (input.adIds?.length) parts.push(inArray(metaAdInsights.objectId, input.adIds));
  const campaign = input.campaignIds?.length ? "" : input.campaignContains?.trim();
  if (campaign) {
    const needle = campaign
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/đ/g, "d")
      .replace(/Đ/g, "D")
      .toLowerCase();
    parts.push(sql`lower(unaccent(coalesce(${metaAdInsights.campaignName}, ''))) like ${`%${needle}%`}`);
  }
  if (input.brands?.length) {
    const brandSql = input.brands.map((brand) => {
      const escaped = brand.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      return sql`${metaAdInsights.campaignName} ~* ${`\\m${escaped}\\M`}`;
    });
    parts.push(sql`(${sql.join(brandSql, sql` or `)})`);
  }

  const where = and(...parts);
  const metrics = {
    spend: sql<number>`coalesce(sum(${metaAdInsights.spend}), 0)`,
    impressions: sql<number>`coalesce(sum(${metaAdInsights.impressions}), 0)`,
    clicks: sql<number>`coalesce(sum(${metaAdInsights.clicks}), 0)`,
    leads: sql<number>`coalesce(sum(${metaAdInsights.leads}), 0)`,
  };

  const [totals] = await getDb().select(metrics).from(metaAdInsights).where(where);

  const brandGroupExpr = input.brandOptions?.length
    ? sql<string>`case ${sql.join(
        input.brandOptions.map((b) => {
          const escCode = b.code.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const escName = b.name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return sql`when ${metaAdInsights.campaignName} ~* ${`\\m${escCode}\\M|\\m${escName}\\M`} then ${b.name}`;
        }),
        sql` `,
      )} else 'Khác' end`
    : sql<string>`case
        when ${metaAdInsights.campaignName} ~* 'bmw' then 'BMW'
        when ${metaAdInsights.campaignName} ~* 'mazda' then 'Mazda'
        when ${metaAdInsights.campaignName} ~* 'kia' then 'Kia'
        when ${metaAdInsights.campaignName} ~* 'peugeot|\\mpeu\\M' then 'Peugeot'
        else 'Khác'
      end`;

  const groupExpr =
    input.groupBy === "fanpage"
      ? sql<string>`coalesce(${facebookPages.name}, ${metaAdInsights.pageId}, 'Không gắn fanpage')`
      : input.groupBy === "campaign"
        ? sql<string>`coalesce(${metaAdInsights.campaignName}, ${metaAdInsights.campaignId}, 'Không gắn chiến dịch')`
        : input.groupBy === "brand"
          ? brandGroupExpr
          : null;

  const rankSql =
    input.rankBy === "leads"
      ? sql`coalesce(sum(${metaAdInsights.leads}), 0)`
      : input.rankBy === "clicks"
        ? sql`coalesce(sum(${metaAdInsights.clicks}), 0)`
        : sql`coalesce(sum(${metaAdInsights.spend}), 0)`;
  const rankOrder =
    input.rankBy === "cpl"
      ? sql`case when coalesce(sum(${metaAdInsights.leads}), 0) = 0 then null else sum(${metaAdInsights.spend}) / sum(${metaAdInsights.leads}) end asc nulls last`
      : desc(rankSql);
  const limit = input.limit ?? 12;

  let rows: MarketingBreakdownRow[] = [];
  if (input.groupBy === "ad") {
    const grouped = await getDb()
      .select({
        id: metaAdInsights.objectId,
        adName: sql<string>`coalesce(max(${metaAdInsights.objectName}), ${metaAdInsights.objectId})`,
        campaignName: sql<string | null>`max(${metaAdInsights.campaignName})`,
        campaignId: sql<string | null>`max(${metaAdInsights.campaignId})`,
        pageId: sql<string | null>`max(${metaAdInsights.pageId})`,
        ...metrics,
      })
      .from(metaAdInsights)
      .where(where)
      .groupBy(metaAdInsights.objectId)
      .orderBy(rankOrder)
      .limit(limit);
    rows = grouped.map((row) => ({
      id: row.id,
      key: row.campaignName ? `${row.adName} — ${row.campaignName}` : row.adName,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      pageId: row.pageId,
      adUrl: `https://facebook.com/${row.id}`,
      crmUrl: row.campaignName ? `/marketing?search=${encodeURIComponent(row.campaignName)}` : `/marketing`,
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      clicks: asNumber(row.clicks),
      leads: asNumber(row.leads),
    }));
  } else if (input.groupBy === "campaign") {
    const grouped = await getDb()
      .select({
        campaignId: sql<string>`coalesce(${metaAdInsights.campaignId}, '')`,
        campaignName: sql<string>`coalesce(${metaAdInsights.campaignName}, ${metaAdInsights.campaignId}, 'Không gắn chiến dịch')`,
        pageId: sql<string | null>`max(${metaAdInsights.pageId})`,
        ...metrics,
      })
      .from(metaAdInsights)
      .where(where)
      .groupBy(metaAdInsights.campaignId, metaAdInsights.campaignName)
      .orderBy(rankOrder)
      .limit(limit);
    rows = grouped.map((row) => ({
      id: row.campaignId,
      key: row.campaignName,
      campaignId: row.campaignId,
      campaignName: row.campaignName,
      pageId: row.pageId,
      crmUrl: `/marketing?search=${encodeURIComponent(row.campaignName)}`,
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      clicks: asNumber(row.clicks),
      leads: asNumber(row.leads),
    }));
  } else if (input.groupBy === "fanpage") {
    const grouped = await getDb()
      .select({
        pageId: metaAdInsights.pageId,
        pageName: sql<string>`coalesce(max(${facebookPages.name}), ${metaAdInsights.pageId}, 'Không gắn fanpage')`,
        ...metrics,
      })
      .from(metaAdInsights)
      .leftJoin(facebookPages, eq(metaAdInsights.pageId, facebookPages.facebookPageId))
      .where(where)
      .groupBy(metaAdInsights.pageId)
      .orderBy(rankOrder)
      .limit(limit);
    rows = grouped.map((row) => ({
      id: row.pageId ?? undefined,
      key: row.pageName,
      pageId: row.pageId,
      adUrl: row.pageId ? `https://facebook.com/${row.pageId}` : null,
      crmUrl: row.pageId ? `/leads?page=${encodeURIComponent(row.pageId)}` : `/leads`,
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      clicks: asNumber(row.clicks),
      leads: asNumber(row.leads),
    }));
  } else if (groupExpr) {
    const grouped = await getDb()
      .select({ key: groupExpr, ...metrics })
      .from(metaAdInsights)
      .where(where)
      .groupBy(sql`1`)
      .orderBy(rankOrder)
      .limit(limit);
    rows = grouped.map((row) => ({
      key: row.key,
      spend: asNumber(row.spend),
      impressions: asNumber(row.impressions),
      clicks: asNumber(row.clicks),
      leads: asNumber(row.leads),
    }));
  }

  return {
    totals: {
      spend: asNumber(totals?.spend),
      impressions: asNumber(totals?.impressions),
      clicks: asNumber(totals?.clicks),
      leads: asNumber(totals?.leads),
    },
    rows,
  };
}

export async function listCampaignNames(
  pageIds: string[] | null,
  query: string,
): Promise<{ id: string; name: string }[]> {
  if (pageIds && pageIds.length === 0) return [];
  const needle = query
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
  const parts = [eq(metaAdInsights.level, "ad"), sql`${metaAdInsights.campaignId} is not null`];
  if (pageIds) parts.push(inArray(metaAdInsights.pageId, pageIds));
  if (needle) {
    parts.push(sql`lower(unaccent(coalesce(${metaAdInsights.campaignName}, ''))) like ${`%${needle}%`}`);
  }
  const rows = await getDb()
    .select({
      id: metaAdInsights.campaignId,
      name: sql<string>`max(${metaAdInsights.campaignName})`,
    })
    .from(metaAdInsights)
    .where(and(...parts))
    .groupBy(metaAdInsights.campaignId)
    .limit(30);
  return rows.flatMap((row) => (row.id && row.name ? [{ id: row.id, name: row.name }] : []));
}

export async function hasSyncedInsights(): Promise<boolean> {
  const db = getDb();
  const [insightRows, syncRuns] = await Promise.all([
    db
      .select({ id: metaAdInsights.id })
      .from(metaAdInsights)
      .where(eq(metaAdInsights.level, "campaign"))
      .limit(1),
    db
      .select({
        status: metaSyncRuns.status,
        imported: metaSyncRuns.imported,
        updated: metaSyncRuns.updated,
      })
      .from(metaSyncRuns)
      .where(eq(metaSyncRuns.kind, "insights"))
      .orderBy(desc(metaSyncRuns.startedAt))
      .limit(1),
  ]);
  const lastRun = syncRuns[0];
  return (
    insightRows.length > 0 ||
    Boolean(lastRun?.status === "ok" && lastRun.imported + lastRun.updated > 0)
  );
}
