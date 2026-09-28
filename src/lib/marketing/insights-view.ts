import type { AdInsightRow, InsightRow } from "@/lib/db/insights-repo";

export const CAMPAIGN_BRANDS = [
  { id: "KIA", label: "Kia" },
  { id: "MAZDA", label: "Mazda" },
  { id: "PEUGEOT", label: "Peugeot" },
  { id: "BMW", label: "BMW" },
  { id: "OTHER", label: "Khác" },
] as const;

export type CampaignBrandId = (typeof CAMPAIGN_BRANDS)[number]["id"];

export type InsightFilter = {
  from: string | null;
  to: string | null;
  campaignIds: string[];
  brands: CampaignBrandId[];
  query: string;
};

export type CampaignSummary = {
  objectId: string;
  objectName: string | null;
  brand: CampaignBrandId;
  days: number;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number | null;
  cpl: number | null;
  from: string;
  to: string;
};

export type DailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
};

export function campaignBrand(name: string | null): CampaignBrandId {
  const value = name ?? "";
  if (/bmw/i.test(value)) return "BMW";
  if (/mazda/i.test(value)) return "MAZDA";
  if (/kia/i.test(value)) return "KIA";
  if (/peugeot|\bpeu\b/i.test(value)) return "PEUGEOT";
  return "OTHER";
}

export function foldText(value: string): string {
  return value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

export function filterInsightRows(rows: InsightRow[], filter: InsightFilter): InsightRow[] {
  const query = foldText(filter.query.trim());
  return rows.filter((row) => {
    if (filter.from && row.date < filter.from) return false;
    if (filter.to && row.date > filter.to) return false;
    if (filter.campaignIds.length > 0 && !filter.campaignIds.includes(row.objectId)) return false;
    if (filter.brands.length > 0 && !filter.brands.includes(campaignBrand(row.objectName))) return false;
    if (!query) return true;
    return foldText(`${row.objectName ?? ""} ${row.objectId}`).includes(query);
  });
}

function amount(value: number | null): number {
  return value ?? 0;
}

export function summarizeCampaigns(rows: InsightRow[]): CampaignSummary[] {
  const grouped = new Map<string, CampaignSummary>();

  for (const row of rows) {
    const current = grouped.get(row.objectId);
    if (!current) {
      grouped.set(row.objectId, {
        objectId: row.objectId,
        objectName: row.objectName,
        brand: campaignBrand(row.objectName),
        days: 1,
        spend: amount(row.spend),
        impressions: amount(row.impressions),
        clicks: amount(row.clicks),
        leads: amount(row.leads),
        ctr: null,
        cpl: null,
        from: row.date,
        to: row.date,
      });
      continue;
    }

    current.days += 1;
    current.spend += amount(row.spend);
    current.impressions += amount(row.impressions);
    current.clicks += amount(row.clicks);
    current.leads += amount(row.leads);
    if (row.objectName) current.objectName = row.objectName;
    if (row.date < current.from) current.from = row.date;
    if (row.date > current.to) current.to = row.date;
  }

  for (const item of grouped.values()) {
    item.ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : null;
    item.cpl = item.leads > 0 ? item.spend / item.leads : null;
  }

  return [...grouped.values()];
}

export function seriesByDate(rows: InsightRow[]): DailyPoint[] {
  const grouped = new Map<string, DailyPoint>();
  for (const row of rows) {
    const current = grouped.get(row.date) ?? {
      date: row.date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
    };
    current.spend += amount(row.spend);
    current.impressions += amount(row.impressions);
    current.clicks += amount(row.clicks);
    current.leads += amount(row.leads);
    grouped.set(row.date, current);
  }
  return [...grouped.values()].sort((left, right) => left.date.localeCompare(right.date));
}

export function dashboardTotals(rows: InsightRow[]) {
  const spend = rows.reduce((sum, row) => sum + amount(row.spend), 0);
  const impressions = rows.reduce((sum, row) => sum + amount(row.impressions), 0);
  const clicks = rows.reduce((sum, row) => sum + amount(row.clicks), 0);
  const leads = rows.reduce((sum, row) => sum + amount(row.leads), 0);
  return {
    spend: rows.length > 0 ? spend : null,
    impressions: rows.length > 0 ? impressions : null,
    clicks: rows.length > 0 ? clicks : null,
    leads: rows.length > 0 ? leads : null,
    ctr: impressions > 0 ? (clicks / impressions) * 100 : null,
    cpl: leads > 0 ? spend / leads : null,
  };
}

export type Efficiency = "strong" | "average" | "weak" | "no_lead";

export const EFFICIENCY_LABEL: Record<Efficiency, string> = {
  strong: "Hiệu quả",
  average: "Trung bình",
  weak: "Kém",
  no_lead: "Chưa ra lead",
};

const EFFICIENCY_RANK: Record<Efficiency, number> = {
  strong: 0,
  average: 1,
  weak: 2,
  no_lead: 3,
};

export type AdFilter = InsightFilter & {
  pageIds: string[];
};

export type PageSummary = {
  pageId: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  ctr: number | null;
  cpl: number | null;
};

export type AdSummary = CampaignSummary & {
  campaignId: string | null;
  campaignName: string | null;
  adsetName: string | null;
  pageId: string | null;
};

export function filterAdRows(rows: AdInsightRow[], filter: AdFilter): AdInsightRow[] {
  const query = foldText(filter.query.trim());
  return rows.filter((row) => {
    if (filter.from && row.date < filter.from) return false;
    if (filter.to && row.date > filter.to) return false;
    if (filter.pageIds.length > 0 && !filter.pageIds.includes(row.pageId ?? "")) return false;
    if (filter.campaignIds.length > 0 && !filter.campaignIds.includes(row.campaignId ?? "")) return false;
    if (filter.brands.length > 0 && !filter.brands.includes(campaignBrand(row.campaignName))) return false;
    if (!query) return true;
    return foldText(`${row.objectName ?? ""} ${row.campaignName ?? ""} ${row.adsetName ?? ""}`).includes(query);
  });
}

function finishRates<T extends { spend: number; impressions: number; clicks: number; leads: number; ctr: number | null; cpl: number | null }>(
  item: T,
) {
  item.ctr = item.impressions > 0 ? (item.clicks / item.impressions) * 100 : null;
  item.cpl = item.leads > 0 ? item.spend / item.leads : null;
  return item;
}

export function summarizePages(rows: AdInsightRow[]): PageSummary[] {
  const grouped = new Map<string, PageSummary>();
  for (const row of rows) {
    const pageId = row.pageId ?? "";
    const current = grouped.get(pageId) ?? {
      pageId,
      spend: 0,
      impressions: 0,
      clicks: 0,
      leads: 0,
      ctr: null,
      cpl: null,
    };
    current.spend += amount(row.spend);
    current.impressions += amount(row.impressions);
    current.clicks += amount(row.clicks);
    current.leads += amount(row.leads);
    grouped.set(pageId, current);
  }
  return [...grouped.values()].map((item) => finishRates(item));
}

export function summarizeCampaignsFromAds(rows: AdInsightRow[]): CampaignSummary[] {
  const grouped = new Map<string, CampaignSummary>();
  for (const row of rows) {
    const objectId = row.campaignId ?? "";
    const current = grouped.get(objectId);
    if (!current) {
      grouped.set(objectId, {
        objectId,
        objectName: row.campaignName,
        brand: campaignBrand(row.campaignName),
        days: 1,
        spend: amount(row.spend),
        impressions: amount(row.impressions),
        clicks: amount(row.clicks),
        leads: amount(row.leads),
        ctr: null,
        cpl: null,
        from: row.date,
        to: row.date,
      });
      continue;
    }
    current.days += 1;
    current.spend += amount(row.spend);
    current.impressions += amount(row.impressions);
    current.clicks += amount(row.clicks);
    current.leads += amount(row.leads);
    if (row.campaignName) current.objectName = row.campaignName;
    if (row.date < current.from) current.from = row.date;
    if (row.date > current.to) current.to = row.date;
  }
  return [...grouped.values()].map((item) => finishRates(item));
}

export function summarizeAds(rows: AdInsightRow[]): AdSummary[] {
  const grouped = new Map<string, AdSummary>();
  for (const row of rows) {
    const current = grouped.get(row.objectId);
    if (!current) {
      grouped.set(row.objectId, {
        objectId: row.objectId,
        objectName: row.objectName,
        brand: campaignBrand(row.campaignName),
        days: 1,
        spend: amount(row.spend),
        impressions: amount(row.impressions),
        clicks: amount(row.clicks),
        leads: amount(row.leads),
        ctr: null,
        cpl: null,
        from: row.date,
        to: row.date,
        campaignId: row.campaignId,
        campaignName: row.campaignName,
        adsetName: row.adsetName,
        pageId: row.pageId,
      });
      continue;
    }
    current.days += 1;
    current.spend += amount(row.spend);
    current.impressions += amount(row.impressions);
    current.clicks += amount(row.clicks);
    current.leads += amount(row.leads);
    if (row.objectName) current.objectName = row.objectName;
    if (row.adsetName) current.adsetName = row.adsetName;
    if (row.pageId) current.pageId = row.pageId;
    if (row.date < current.from) current.from = row.date;
    if (row.date > current.to) current.to = row.date;
  }
  return [...grouped.values()].map((item) => finishRates(item));
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const mid = Math.floor(sorted.length / 2);
  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (sorted.length % 2 === 0 && lower != null && upper != null) return (lower + upper) / 2;
  return upper ?? null;
}

export function efficiencyOf(spend: number, leads: number, cpl: number | null, benchmark: number | null): Efficiency {
  if (leads <= 0) return spend > 0 ? "no_lead" : "average";
  if (benchmark == null || cpl == null) return "average";
  if (cpl <= benchmark) return "strong";
  if (cpl <= benchmark * 1.5) return "average";
  return "weak";
}

export function attachEfficiency<T extends { spend: number; leads: number; cpl: number | null }>(items: T[]) {
  const benchmark = median(
    items.flatMap((item) => (item.leads > 0 && item.cpl != null ? [item.cpl] : [])),
  );
  return {
    benchmark,
    items: items.map((item) => ({
      ...item,
      efficiency: efficiencyOf(item.spend, item.leads, item.cpl, benchmark),
    })),
  };
}

export function pageLabelFromCampaigns(names: Array<string | null>): string | null {
  const counts = new Map<string, number>();
  for (const name of names) {
    const match = name?.match(/^T\d+\.\d{4}-(.+)$/i);
    if (!match?.[1]) continue;
    const label = match[1]
      .replace(/\s*-\s*bản sao.*$/i, "")
      .replace(/\s*-\s*(tin nhắn|lead|post)\b.*$/i, "")
      .trim();
    if (!label) continue;
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].length - right[0].length);
  return ranked[0]?.[0] ?? null;
}

export function efficiencyRank(value: Efficiency) {
  return EFFICIENCY_RANK[value];
}

export function storedSpan(rows: InsightRow[]): { from: string | null; to: string | null } {
  if (rows.length === 0) return { from: null, to: null };
  let from = rows[0]?.date ?? null;
  let to = rows[0]?.date ?? null;
  for (const row of rows) {
    if (from === null || row.date < from) from = row.date;
    if (to === null || row.date > to) to = row.date;
  }
  return { from, to };
}
