import { and, asc, desc, eq, gte, lte } from "drizzle-orm";

import { getDb } from "./client";
import { metaAdInsights } from "./schema";

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

export type InsightTotals = {
  spend: number | null;
  impressions: number | null;
  clicks: number | null;
  leads: number | null;
};

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

export async function listCampaignInsights(range: {
  from: string;
  to: string;
}): Promise<InsightRow[]> {
  const from = utcDate(range.from, "Ngày bắt đầu");
  const to = utcDate(range.to, "Ngày kết thúc");
  if (from > to) throw new Error("Ngày bắt đầu phải trước ngày kết thúc.");

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
      and(
        eq(metaAdInsights.level, "campaign"),
        gte(metaAdInsights.dateStart, from),
        lte(metaAdInsights.dateStart, to),
      ),
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
