import { z } from "zod";

import { dataScope } from "@/lib/auth/roles";
import type { ViewerScope } from "@/lib/db/leads-repo";
import { previousCalendarRange } from "@/lib/date-range";
import { EMPTY_FILTERS } from "@/lib/filters";
import { PIVOT_DIMENSIONS, type PivotDimension } from "@/lib/metrics";
import type { LeadFilters, LeadKpis } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, ratio, toVnParts } from "@/lib/utils";

import { exportFiltersSchema, type ExportFilters } from "./export-spec";

const GROUP_VALUES = ["fanpage", "ad", ...Object.keys(PIVOT_DIMENSIONS)] as [string, ...string[]];

/**
 * Câu hỏi số liệu được phép biến thành cấu trúc này. Model chỉ điền bộ lọc;
 * server tự chạy SQL và tự viết câu trả lời, nên model không bịa được con số.
 */
export const statsQuerySchema = z.object({
  dateFrom: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional()
    .describe("Ngày bắt đầu yyyy-MM-dd. Bỏ trống nếu hỏi mọi thời điểm"),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  comparePrevious: z
    .boolean()
    .optional()
    .describe("true khi người dùng muốn so với kỳ liền trước"),
  dataset: z
    .enum(["leads", "marketing", "both"])
    .optional()
    .describe("leads = lead CRM, marketing = chi tiêu/click/lead quảng cáo, both = đọc cả hai"),
  groupBy: z
    .enum(GROUP_VALUES)
    .nullable()
    .optional()
    .describe("ad = từng quảng cáo. campaign = chiến dịch. fanpage, source, category, assignee, brand, product, location, channelDetail"),
  rankBy: z
    .enum(["leads", "spend", "clicks", "cpl"])
    .nullable()
    .optional()
    .describe("Cột dùng để xếp hạng. Nhiều lead nhất = leads. CPL thấp nhất = cpl"),
  topN: z.number().int().min(1).max(12).nullable().optional().describe("Số dòng hạng, ví dụ 5 khi hỏi cái nhất"),
  pageQuery: z
    .string()
    .max(80)
    .nullable()
    .optional()
    .describe("Tên fanpage người dùng nhắc, không điền ID"),
  campaignQuery: z.string().max(120).nullable().optional(),
  assigneeQuery: z.string().max(80).nullable().optional(),
  filters: exportFiltersSchema.optional(),
});

/** Schema nhận lại `lastStats` từ client để kế thừa ngữ cảnh qua nhiều lượt hội thoại. */
export const lastStatsSchema = statsQuerySchema.extend({
  pageIds: z.array(z.string().max(80)).nullable().optional(),
  campaignIds: z.array(z.string().max(80)).nullable().optional(),
  adIds: z.array(z.string().max(80)).nullable().optional(),
  leadIds: z.array(z.string().max(80)).nullable().optional(),
});

export type StatsDataset = "leads" | "marketing" | "both";

export interface StatsQuery {
  dateFrom: string | null;
  dateTo: string | null;
  comparePrevious: boolean;
  /** leads = dòng CRM, marketing = insights quảng cáo, both = đọc cả hai. */
  dataset: StatsDataset;
  groupBy: "fanpage" | "ad" | PivotDimension | null;
  /** Cột để xếp hạng. Null thì danh sách quảng cáo xếp theo chi tiêu. */
  rankBy: "leads" | "spend" | "clicks" | "cpl" | null;
  topN: number | null;
  pageQuery: string | null;
  campaignQuery: string | null;
  assigneeQuery: string | null;
  /** Id đã chọn bằng @ hoặc đã khớp đúng một tên. Không lấy id do model tự điền. */
  pageIds: string[] | null;
  campaignIds: string[] | null;
  adIds: string[] | null;
  leadIds: string[] | null;
  filters: ExportFilters;
}

export interface MarketingTotals {
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
}

export type MarketingGroupBy = "fanpage" | "campaign" | "brand" | "ad";

export interface PageOption {
  facebookPageId: string;
  name: string | null;
}

export interface StatsBreakdownRow {
  key: string;
  leads: number;
  contacted: number;
  khqt: number;
  failed: number;
  contactRate?: number;
  khqtRate?: number;
  failRate?: number;
}

export function fold(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase()
    .trim();
}

function blank(value: string | null | undefined) {
  const text = value?.trim();
  return text ? text : null;
}

export function asGroupBy(value: string | null | undefined): StatsQuery["groupBy"] {
  if (!value) return null;
  if (value === "fanpage" || value === "ad") return value;
  if (value in PIVOT_DIMENSIONS) return value as PivotDimension;
  return null;
}

export function statsFromModel(input: unknown): StatsQuery | null {
  const parsed = statsQuerySchema.safeParse(input);
  if (!parsed.success) return null;
  const stats = parsed.data;
  return {
    dateFrom: stats.dateFrom ?? null,
    dateTo: stats.dateTo ?? null,
    comparePrevious: Boolean(stats.comparePrevious),
    dataset: stats.dataset ?? "leads",
    groupBy: asGroupBy(stats.groupBy),
    rankBy: stats.rankBy ?? null,
    topN: stats.topN ?? null,
    pageQuery: blank(stats.pageQuery),
    campaignQuery: blank(stats.campaignQuery),
    assigneeQuery: blank(stats.assigneeQuery),
    pageIds: null,
    campaignIds: null,
    adIds: null,
    leadIds: null,
    filters: { ...stats.filters, facebookPageIds: undefined },
  };
}

export function statsFromLastStats(input: unknown): StatsQuery | null {
  const parsed = lastStatsSchema.safeParse(input);
  if (!parsed.success) return null;
  const stats = parsed.data;
  return {
    dateFrom: stats.dateFrom ?? null,
    dateTo: stats.dateTo ?? null,
    comparePrevious: Boolean(stats.comparePrevious),
    dataset: stats.dataset ?? "leads",
    groupBy: asGroupBy(stats.groupBy),
    rankBy: stats.rankBy ?? null,
    topN: stats.topN ?? null,
    pageQuery: blank(stats.pageQuery),
    campaignQuery: blank(stats.campaignQuery),
    assigneeQuery: blank(stats.assigneeQuery),
    pageIds: stats.pageIds?.length ? stats.pageIds : null,
    campaignIds: stats.campaignIds?.length ? stats.campaignIds : null,
    adIds: stats.adIds?.length ? stats.adIds : null,
    leadIds: stats.leadIds?.length ? stats.leadIds : null,
    filters: { ...stats.filters },
  };
}

export function pagesInScope(pages: PageOption[], viewer: ViewerScope): PageOption[] {
  if (dataScope(viewer) === "all") return pages;
  const allowed = new Set(viewer.pageIds);
  return pages.filter((page) => allowed.has(page.facebookPageId));
}

export function matchPages(pages: PageOption[], query: string): PageOption[] {
  const needle = fold(query);
  if (!needle) return [];
  return pages.filter(
    (page) => fold(page.name ?? "").includes(needle) || page.facebookPageId.includes(query.trim()),
  );
}

export const GROUP_LABEL: Record<string, string> = {
  fanpage: "fanpage",
  ad: "quảng cáo",
  ...PIVOT_DIMENSIONS,
};

function vnDate(iso: string) {
  const [year, month, day] = iso.split("-");
  return `${day}/${month}/${year}`;
}

export function periodLabel(from: string | null, to: string | null) {
  if (from && to) return `Từ ${vnDate(from)} đến ${vnDate(to)}`;
  if (from) return `Từ ${vnDate(from)}`;
  if (to) return `Đến ${vnDate(to)}`;
  return "Tất cả thời gian";
}

function deltaLabel(current: number, previous: number) {
  const diff = current - previous;
  if (diff === 0) return "không đổi";
  if (diff > 0) return `tăng ${formatNumber(diff)}`;
  return `giảm ${formatNumber(-diff)}`;
}

export function formatStatsReply(input: {
  viewer: ViewerScope;
  query: StatsQuery;
  kpis: LeadKpis;
  previous: LeadKpis | null;
  previousRange: { from: string | null; to: string | null } | null;
  breakdown: StatsBreakdownRow[] | null;
  unmatchedPage?: string | null;
  visiblePageNames?: string[];
  adsNote?: boolean;
  activeScopeLabels?: string[];
}): string {
  if (dataScope(input.viewer) === "none") {
    return "Tài khoản chưa được gán fanpage, nên không có lead nào trong phạm vi xem.";
  }

  if (input.unmatchedPage) {
    const names = input.visiblePageNames?.filter(Boolean) ?? [];
    const hint = names.length ? ` Fanpage trong phạm vi: ${names.join(", ")}.` : "";
    return `Không thấy fanpage khớp «${input.unmatchedPage}» trong phạm vi tài khoản.${hint}`;
  }

  const baseScope =
    dataScope(input.viewer) === "all"
      ? "Số liệu trên toàn bộ lead CRM"
      : "Số liệu trong các fanpage được gán cho tài khoản";
  const scopeFilterText =
    input.activeScopeLabels && input.activeScopeLabels.length > 0
      ? ` (${input.activeScopeLabels.join(" • ")})`
      : "";
  const scope = `${baseScope}${scopeFilterText}.`;

  const { kpis } = input;
  const lines = [
    scope,
    periodLabel(input.query.dateFrom, input.query.dateTo) + ".",
    "",
    `• Tổng lead: ${formatNumber(kpis.total)}`,
    `• Đã liên hệ: ${formatNumber(kpis.contacted)} (${formatPercent(kpis.contactRate)})`,
    `• KHQT trở lên: ${formatNumber(kpis.khqt)} (${formatPercent(kpis.khqtRate)} trên số đã liên hệ)`,
    `• GDTD trở lên: ${formatNumber(kpis.gdtd)}`,
    `• Ký hợp đồng: ${formatNumber(kpis.khd)}`,
    `• Bị loại: ${formatNumber(kpis.failed)} (${formatPercent(kpis.failRate)})`,
    `• Quá hạn gọi lại: ${formatNumber(kpis.overdue)}`,
  ];

  if (input.query.comparePrevious) {
    if (input.previous && input.previousRange?.from && input.previousRange.to) {
      lines.push(
        "",
        `Kỳ trước (${vnDate(input.previousRange.from)}–${vnDate(input.previousRange.to)}): ${formatNumber(input.previous.total)} lead, ${deltaLabel(kpis.total, input.previous.total)}.`,
      );
    } else {
      lines.push("", "Chưa đủ khoảng ngày để so với kỳ trước.");
    }
  }

  if (input.breakdown && input.query.groupBy) {
    const label = GROUP_LABEL[input.query.groupBy] ?? input.query.groupBy;
    lines.push("", `Theo ${label}:`);
    if (input.breakdown.length === 0) {
      lines.push("• Không có lead trong kỳ này.");
    } else {
      for (const row of input.breakdown.slice(0, 8)) {
        const contactRate = row.contactRate ?? ratio(row.contacted, row.leads);
        const khqtRate =
          row.khqtRate ?? (row.contacted > 0 ? ratio(row.khqt, row.contacted) : ratio(row.khqt, row.leads));
        const failRate = row.failRate ?? ratio(row.failed, row.leads);
        lines.push(
          `• ${row.key}: ${formatNumber(row.leads)} lead | Đã LH: ${formatPercent(contactRate)} | KHQT: ${formatPercent(khqtRate)} | Loại: ${formatPercent(failRate)}`,
        );
      }
    }
  }

  if (input.adsNote) {
    lines.push("", "Đây là lead đã vào CRM, không phải lượt lead trên báo cáo quảng cáo.");
  }

  return lines.join("\n");
}

export function statsToFilters(query: StatsQuery, pageIds: string[]): LeadFilters {
  const filters = query.filters ?? {};
  return {
    ...EMPTY_FILTERS,
    search: filters.search ?? "",
    tab: filters.overdueOnly
      ? "QUA_HAN"
      : filters.contactStatus === "CHUA_LIEN_HE"
        ? "CHUA_LIEN_HE"
        : filters.contactStatus === "DA_LIEN_HE"
          ? "DA_LIEN_HE"
          : "ALL",
    dateFrom: query.dateFrom,
    dateTo: query.dateTo,
    sources: (filters.sources ?? []) as LeadFilters["sources"],
    channelDetails: (filters.channelDetails ?? []) as LeadFilters["channelDetails"],
    brands: filters.brands ?? [],
    locations: filters.locations ?? [],
    assignees: filters.assignees ?? [],
    products: filters.products ?? [],
    categories: (filters.categories ?? []) as LeadFilters["categories"],
    failReasons: (filters.failReasons ?? []) as LeadFilters["failReasons"],
    facebookPageIds: pageIds,
  };
}

export function marketingGroupBy(groupBy: StatsQuery["groupBy"]): MarketingGroupBy | null {
  if (groupBy === "fanpage" || groupBy === "campaign" || groupBy === "brand" || groupBy === "ad") return groupBy;
  return null;
}

/** Từ khóa trong câu hỏi thắng lựa chọn của model khi model chọn nhầm chiều; đồng thời kế thừa ngữ cảnh lượt trước. */
export function mergeStats(
  model: StatsQuery | null,
  local: StatsQuery | null,
  lastStats?: StatsQuery | null,
  text?: string,
  now?: Date,
): StatsQuery | null {
  let merged: StatsQuery | null = null;
  if (!model) {
    merged = local;
  } else if (!local) {
    merged = model;
  } else {
    const time = text !== undefined ? parseTimeRange(text, now) : null;
    const dateFrom = time?.clearsDate
      ? null
      : time?.hasExplicitTime
        ? time.dateFrom
        : (local.dateFrom ?? model.dateFrom);
    const dateTo = time?.clearsDate
      ? null
      : time?.hasExplicitTime
        ? time.dateTo
        : (local.dateTo ?? model.dateTo);

    merged = {
      ...model,
      dateFrom,
      dateTo,
      comparePrevious: local.comparePrevious || model.comparePrevious,
      dataset: text !== undefined && !hasExplicitDataset(text) ? model.dataset : local.dataset,
      groupBy: local.groupBy ?? model.groupBy,
      rankBy: local.rankBy ?? model.rankBy,
      topN: local.topN ?? model.topN,
      pageQuery: local.pageQuery ?? model.pageQuery,
      campaignQuery: local.campaignQuery ?? model.campaignQuery,
      assigneeQuery: local.assigneeQuery ?? model.assigneeQuery,
      pageIds: local.pageIds ?? model.pageIds,
      campaignIds: local.campaignIds ?? model.campaignIds,
      adIds: local.adIds ?? model.adIds,
      leadIds: local.leadIds ?? model.leadIds,
      filters: mergeExportFilters(model.filters, local.filters),
    };
  }

  if (lastStats) {
    return inheritStatsQuery(merged ?? blankStats(), lastStats, text ?? "", now);
  }
  return merged;
}

function mergeExportFilters(base: ExportFilters | undefined, override: ExportFilters | undefined): ExportFilters {
  const result: ExportFilters = { ...(base ?? {}) };
  if (!override) return result;
  if (override.search !== undefined) result.search = override.search;
  if (override.dateField !== undefined) result.dateField = override.dateField;
  if (override.dateFrom !== undefined) result.dateFrom = override.dateFrom;
  if (override.dateTo !== undefined) result.dateTo = override.dateTo;
  if (override.contactStatus !== undefined) result.contactStatus = override.contactStatus;
  if (override.overdueOnly !== undefined) result.overdueOnly = override.overdueOnly;
  if (override.categories?.length) result.categories = override.categories;
  if (override.failReasons?.length) result.failReasons = override.failReasons;
  if (override.sources?.length) result.sources = override.sources;
  if (override.channelDetails?.length) result.channelDetails = override.channelDetails;
  if (override.brands?.length) result.brands = override.brands;
  if (override.products?.length) result.products = override.products;
  if (override.locations?.length) result.locations = override.locations;
  if (override.assignees?.length) result.assignees = override.assignees;
  if (override.facebookPageIds?.length) result.facebookPageIds = override.facebookPageIds;
  return result;
}

/** Nhận diện khi người dùng muốn thoát khỏi bộ lọc fanpage/thực thể đang ghim để xem toàn hệ thống. */
export function wantsResetScope(text: string): boolean {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  return /(?:tat ca|toan bo)\s+(?:cac\s+)?(?:fanpage|page|lead|he thong)|toan he thong|bo loc|xoa loc|bo ghim/.test(
    q,
  );
}

/** Loại bỏ nhãn @mention ở cuối câu hỏi để tên fanpage/chiến dịch không làm nhiễu bộ đọc thời gian. */
export function stripMentionLabels(text: string, mentions: ChatMention[] = []): string {
  let result = text;
  for (const m of mentions) {
    if (!m.label) continue;
    const escaped = m.label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(new RegExp(`@${escaped}`, "gi"), " ");
  }
  return result.replace(/\s+/g, " ").trim();
}

/**
 * Hợp nhất @mentions của lượt hiện tại với @mentions đang ghim từ lượt trước.
 * - Nếu người dùng yêu cầu xem "tất cả fanpage / toàn bộ hệ thống" -> xóa mentions cũ.
 * - Nếu lượt này không chọn @mention mới -> tự động giữ nguyên @mentions lượt trước.
 * - Nếu lượt này chọn @mention cùng loại (ví dụ đổi từ @FanpageA sang @FanpageB) -> thay thế loại đó, giữ các loại khác.
 */
export function mergeContextMentions(
  currentMentions: ChatMention[],
  lastMentions: ChatMention[],
  text: string,
): ChatMention[] {
  if (wantsResetScope(text)) return currentMentions;
  if (currentMentions.length === 0) return lastMentions;
  if (lastMentions.length === 0) return currentMentions;
  // Nếu tra cứu đích danh 1 lead cụ thể thì không ghép filter khác
  if (currentMentions.some((m) => m.type === "lead")) return currentMentions;

  const currentTypes = new Set(currentMentions.map((m) => m.type));
  const keptFromLast = lastMentions.filter((m) => m.type !== "lead" && !currentTypes.has(m.type));
  const combined = [...keptFromLast, ...currentMentions];
  const seen = new Set<string>();
  return combined.filter((m) => {
    const key = `${m.type}:${m.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function hasAnyTimeWord(text: string): boolean {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  return /(ngay|tuan|thang|\bthg\b|\bt\d{1,2}\b|quy|nam|hom nay|hom qua|hom kia|ky nay|ky truoc|\d{1,2}\/\d{1,2})/.test(
    q,
  );
}

/**
 * Kế thừa thông minh `lastStats` khi người dùng hỏi nối tiếp (ví dụ: "tháng 8 thì sao?", "chia theo nhân viên thì sao?", "còn @FanpageB?").
 */
export function inheritStatsQuery(
  current: StatsQuery,
  lastStats: StatsQuery | null | undefined,
  text: string,
  now: Date = new Date(),
): StatsQuery {
  if (!lastStats) return current;

  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  const resetScope = wantsResetScope(text);
  const time = parseTimeRange(text, now);
  const local = parseStatsQuestion(text, now);

  // 1. Kế thừa khoảng thời gian nếu câu hỏi mới không nhắc tới mốc thời gian mới
  let dateFrom = current.dateFrom;
  let dateTo = current.dateTo;
  if (time.clearsDate) {
    dateFrom = null;
    dateTo = null;
  } else if (time.hasExplicitTime) {
    dateFrom = time.dateFrom;
    dateTo = time.dateTo;
  } else if (!hasAnyTimeWord(text)) {
    dateFrom = lastStats.dateFrom;
    dateTo = lastStats.dateTo;
  }

  // 2. Kế thừa dataset (leads / marketing / both) nếu câu mới không chỉ định rõ
  const dataset: StatsDataset = hasExplicitDataset(text) ? current.dataset : lastStats.dataset;

  // 3. Kế thừa groupBy / rankBy / topN
  const asksNewGroup = Boolean(local?.groupBy) || /(theo|tung|moi|chia|nhom|phan bo)/.test(q);
  const asksOverviewOnly = /(tong quan|tong hop|khong chia|bo nhom)/.test(q);
  const groupBy = asksOverviewOnly
    ? null
    : asksNewGroup && current.groupBy
      ? current.groupBy
      : (local?.groupBy ?? lastStats.groupBy ?? current.groupBy);

  const rankBy = local?.rankBy ?? (groupBy === lastStats.groupBy ? (current.rankBy ?? lastStats.rankBy) : current.rankBy);
  const topN = rankBy ? (local?.topN ?? current.topN ?? lastStats.topN ?? 5) : null;

  // 4. Nếu người dùng yêu cầu reset phạm vi ("tất cả fanpage"), bỏ các filter thực thể cũ
  if (resetScope) {
    return {
      ...current,
      dateFrom,
      dateTo,
      dataset,
      groupBy,
      rankBy,
      topN,
      pageQuery: null,
      campaignQuery: null,
      assigneeQuery: null,
      pageIds: null,
      campaignIds: null,
      adIds: null,
      leadIds: null,
      filters: current.filters ?? {},
    };
  }

  // 5. Kế thừa các bộ lọc thực thể (fanpage, chiến dịch, nhân viên, sản phẩm, thương hiệu, trạng thái...)
  const pageIds = current.pageIds?.length ? current.pageIds : current.pageQuery ? null : lastStats.pageIds;
  const pageQuery = current.pageQuery ?? (pageIds?.length ? null : lastStats.pageQuery);
  const campaignIds = current.campaignIds?.length
    ? current.campaignIds
    : current.campaignQuery
      ? null
      : lastStats.campaignIds;
  const campaignQuery = current.campaignQuery ?? (campaignIds?.length ? null : lastStats.campaignQuery);
  const assigneeQuery = current.assigneeQuery ?? lastStats.assigneeQuery;
  const adIds = current.adIds?.length ? current.adIds : lastStats.adIds;
  const leadIds = current.leadIds?.length ? current.leadIds : lastStats.leadIds;
  const filters = mergeExportFilters(lastStats.filters, current.filters);

  return {
    dateFrom,
    dateTo,
    comparePrevious: current.comparePrevious,
    dataset,
    groupBy,
    rankBy,
    topN,
    pageQuery,
    campaignQuery,
    assigneeQuery,
    pageIds,
    campaignIds,
    adIds,
    leadIds,
    filters,
  };
}

export function marketingRates(row: MarketingTotals) {
  return {
    ctr: row.impressions > 0 ? (row.clicks / row.impressions) * 100 : null,
    cpl: row.leads > 0 ? row.spend / row.leads : null,
  };
}

const MARKETING_GROUP_LABEL: Record<MarketingGroupBy, string> = {
  fanpage: "fanpage",
  campaign: "chiến dịch",
  brand: "hãng",
  ad: "quảng cáo",
};

function marketingLines(row: MarketingTotals) {
  const rates = marketingRates(row);
  return [
    `• Chi tiêu: ${formatCurrency(row.spend)}`,
    `• Lượt hiển thị: ${formatNumber(row.impressions)}`,
    `• Lượt click: ${formatNumber(row.clicks)}`,
    `• CTR: ${rates.ctr === null ? "—" : formatPercent(rates.ctr)}`,
    `• Lượt lead quảng cáo: ${formatNumber(row.leads)}`,
    `• CPL: ${rates.cpl === null ? "—" : formatCurrency(rates.cpl)}`,
  ];
}

export function formatMarketingReply(input: {
  viewer: ViewerScope;
  query: StatsQuery;
  totals: MarketingTotals;
  previous: MarketingTotals | null;
  previousRange: { from: string | null; to: string | null } | null;
  breakdown: Array<MarketingTotals & { key: string }> | null;
  activeScopeLabels?: string[];
}): string {
  if (dataScope(input.viewer) === "none") {
    return "Tài khoản chưa được gán fanpage, nên không có số quảng cáo trong phạm vi xem.";
  }

  const group = marketingGroupBy(input.query.groupBy);
  const winner = input.query.rankBy ? input.breakdown?.[0] : undefined;
  const scopeSuffix =
    input.activeScopeLabels && input.activeScopeLabels.length > 0
      ? ` (${input.activeScopeLabels.join(" • ")})`
      : "";
  const lines = [
    `Quảng cáo — lượt trên Ads, không phải lead CRM${scopeSuffix}.`,
    periodLabel(input.query.dateFrom, input.query.dateTo) + ".",
  ];

  if (winner && input.query.rankBy) {
    const rates = marketingRates(winner);
    const noun = MARKETING_GROUP_LABEL[group ?? "ad"];
    const metric =
      input.query.rankBy === "spend"
        ? "chi tiêu nhiều nhất"
        : input.query.rankBy === "clicks"
          ? "nhiều click nhất"
          : input.query.rankBy === "cpl"
            ? "có CPL thấp nhất"
            : "thu nhiều lead nhất";
    lines.push(
      "",
      `${noun[0]?.toUpperCase()}${noun.slice(1)} ${metric}: ${winner.key}.`,
      `• ${formatNumber(winner.leads)} lượt lead quảng cáo, chi tiêu ${formatCurrency(winner.spend)}, CPL ${rates.cpl === null ? "—" : formatCurrency(rates.cpl)}.`,
    );
  } else {
    lines.push("", ...marketingLines(input.totals));
  }

  if (input.query.comparePrevious) {
    if (input.previous && input.previousRange?.from && input.previousRange.to) {
      lines.push(
        "",
        `Kỳ trước (${vnDate(input.previousRange.from)}–${vnDate(input.previousRange.to)}): chi tiêu ${formatCurrency(input.previous.spend)}, ${deltaLabel(input.totals.spend, input.previous.spend)}.`,
      );
    } else {
      lines.push("", "Chưa đủ khoảng ngày để so với kỳ trước.");
    }
  }

  if (input.breakdown && group) {
    lines.push("", input.query.rankBy ? "Bảng xếp hạng:" : `Theo ${MARKETING_GROUP_LABEL[group]}:`);
    if (input.breakdown.length === 0) {
      lines.push("• Không có số quảng cáo trong kỳ này.");
    } else {
      for (const row of input.breakdown.slice(0, 8)) {
        const rates = marketingRates(row);
        lines.push(
          input.query.rankBy === "leads"
            ? `• ${row.key}: ${formatNumber(row.leads)} lượt lead, chi tiêu ${formatCurrency(row.spend)}, CPL ${rates.cpl === null ? "—" : formatCurrency(rates.cpl)}`
            : `• ${row.key}: chi tiêu ${formatCurrency(row.spend)}, click ${formatNumber(row.clicks)}, lead quảng cáo ${formatNumber(row.leads)}, CPL ${rates.cpl === null ? "—" : formatCurrency(rates.cpl)}`,
        );
      }
    }
  }

  return lines.join("\n");
}

export function previousRangeFor(query: StatsQuery) {
  if (!query.comparePrevious || !query.dateFrom || !query.dateTo) return null;
  return previousCalendarRange(query.dateFrom, query.dateTo);
}

export type NamedItem = { id: string; name: string };

/** Khớp đúng một tên trong phạm vi. Nhiều kết quả thì không đoán. */
export function pickNamedItem(
  items: NamedItem[],
  query: string,
): { status: "one"; item: NamedItem } | { status: "none" } | { status: "many"; items: NamedItem[] } {
  const needle = fold(query);
  if (!needle) return { status: "none" };
  const exact = items.filter((item) => fold(item.name) === needle);
  if (exact.length === 1) return { status: "one", item: exact[0]! };
  if (exact.length > 1) return { status: "many", items: exact.slice(0, 8) };
  const contained = items.filter((item) => fold(item.name).includes(needle));
  if (contained.length === 1) return { status: "one", item: contained[0]! };
  if (contained.length > 1) return { status: "many", items: contained.slice(0, 8) };
  return { status: "none" };
}

export function formatAmbiguousName(kind: string, query: string, names: string[]) {
  const lines = names.map((name) => `• ${name}`);
  return `Có nhiều ${kind} khớp «${query}». Gõ @ để chọn một:\n${lines.join("\n")}`;
}

export function extractCampaignName(text: string): string | null {
  const match = /(?:cua\s+|trong\s+)?chien dich\s+(.+)$/.exec(fold(text));
  if (!match?.[1]) return null;
  const name = match[1]
    .replace(/\s+(?:vao\s+|trong\s+)?(?:thang\s*\d{1,2}(?:\/\d{4})?|thang nay|thang truoc|hom nay|hom qua|tuan nay|tuan truoc)$/g, "")
    .replace(/\b(thang nay|thang truoc|hom nay)\b/g, "")
    .trim();
  if (!name || /^nao\b/.test(name)) return null;
  return name;
}

export function extractPageFilter(text: string): string | null {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  if (/theo fanpage|tung fanpage|moi fanpage|theo page|tung page|tat ca fanpage|tat ca cac page|tat ca page|toan bo fanpage/.test(q)) {
    return null;
  }
  const match =
    /(?:cua|tren)\s+(?:fanpage|page)\s+(.+?)(?=\s+vao\b|\s+thang\b|\s+tuan\b|\s+quy\b|\s+hom\b|\s+trong\b|\s+so\s+voi\b|\s+theo\b|$)/.exec(
      q,
    );
  if (!match?.[1]) return null;
  const name = match[1].trim();
  if (!name || /^nao\b/.test(name)) return null;
  return name;
}

export const MENTION_TYPES = [
  { id: "fanpage", label: "Fanpage" },
  { id: "campaign", label: "Chiến dịch" },
  { id: "ad", label: "Quảng cáo" },
  { id: "lead", label: "Lead" },
  { id: "assignee", label: "Nhân viên" },
  { id: "product", label: "Loại sản phẩm" },
  { id: "brand", label: "Thương hiệu" },
  { id: "location", label: "Địa chỉ/Chi nhánh" },
] as const;

export type MentionType = (typeof MENTION_TYPES)[number]["id"];

export interface ChatMention {
  type: MentionType;
  id: string;
  label: string;
}

export function blankStats(): StatsQuery {
  return {
    dateFrom: null,
    dateTo: null,
    comparePrevious: false,
    dataset: "both",
    groupBy: null,
    rankBy: null,
    topN: null,
    pageQuery: null,
    campaignQuery: null,
    assigneeQuery: null,
    pageIds: null,
    campaignIds: null,
    adIds: null,
    leadIds: null,
    filters: {},
  };
}

export function applyMentions(query: StatsQuery, mentions: ChatMention[]): StatsQuery {
  const ids = (type: MentionType) => mentions.filter((mention) => mention.type === type).map((mention) => mention.id);
  const pages = ids("fanpage");
  const campaigns = ids("campaign");
  const ads = ids("ad");
  const leads = ids("lead");
  const products = mentions.filter((m) => m.type === "product").map((m) => m.label);
  const brands = mentions.filter((m) => m.type === "brand").map((m) => m.id);
  const locations = mentions.filter((m) => m.type === "location").map((m) => m.label);
  const assignee = mentions.find((mention) => mention.type === "assignee");
  return {
    ...query,
    pageIds: pages.length ? pages : query.pageIds,
    campaignIds: campaigns.length ? campaigns : query.campaignIds,
    adIds: ads.length ? ads : query.adIds,
    leadIds: leads.length ? leads : query.leadIds,
    assigneeQuery: assignee?.label ?? query.assigneeQuery,
    pageQuery: pages.length ? null : query.pageQuery,
    campaignQuery: campaigns.length ? null : query.campaignQuery,
    filters: {
      ...query.filters,
      products: products.length ? products : query.filters?.products,
      brands: brands.length ? brands : query.filters?.brands,
      locations: locations.length ? locations : query.filters?.locations,
    },
  };
}

export interface ParsedTimeRange {
  dateFrom: string | null;
  dateTo: string | null;
  label: string | null;
  hasExplicitTime: boolean;
  clearsDate: boolean;
}

/**
 * Bộ phân tích mốc thời gian tiếng Việt chuẩn hóa dùng chung cho cả STATS và EXPORT.
 * Hỗ trợ: hôm nay, hôm qua, hôm kia, tuần này, tuần trước, N ngày, tháng này, tháng trước,
 * tháng 1..12 (kèm năm hoặc viết tắt t1..t12), quý 1..4, quý này, quý trước, năm nay, năm trước,
 * khoảng ngày dd/mm/yyyy - dd/mm/yyyy, và "tất cả thời gian".
 */
export function parseTimeRange(text: string, now: Date = new Date()): ParsedTimeRange {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  const cleanQ = q;

  const vn = toVnParts(now);
  const ymd = (y: number, m: number, d: number) => {
    const utc = new Date(Date.UTC(y, m, d));
    return `${utc.getUTCFullYear()}-${String(utc.getUTCMonth() + 1).padStart(2, "0")}-${String(utc.getUTCDate()).padStart(2, "0")}`;
  };
  const today = ymd(vn.year, vn.month, vn.day);

  if (/(tat ca thoi gian|toan thoi gian|moi thoi diem|tu truoc den nay|toan bo thoi gian)/.test(cleanQ)) {
    return { dateFrom: null, dateTo: null, label: "tất cả thời gian", hasExplicitTime: true, clearsDate: true };
  }

  // Khoảng ngày cụ thể: dd/mm[/yyyy] đến dd/mm[/yyyy]
  const rangeMatch =
    /(?:tu\s+)?(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?\s*(?:den|toi|-|–)\s*(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?/.exec(
      cleanQ,
    );
  if (rangeMatch) {
    const d1 = Number(rangeMatch[1]);
    const m1 = Number(rangeMatch[2]) - 1;
    const y1 = rangeMatch[3] ? Number(rangeMatch[3]) : vn.year;
    const d2 = Number(rangeMatch[4]);
    const m2 = Number(rangeMatch[5]) - 1;
    const y2 = rangeMatch[6] ? Number(rangeMatch[6]) : y1;
    const from = ymd(y1, m1, d1);
    const to = ymd(y2, m2, d2);
    return { dateFrom: from, dateTo: to, label: `${vnDate(from)}–${vnDate(to)}`, hasExplicitTime: true, clearsDate: false };
  }

  if (/thang nay|dau thang den nay|trong thang nay/.test(cleanQ)) {
    return {
      dateFrom: ymd(vn.year, vn.month, 1),
      dateTo: today,
      label: "tháng này",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/thang truoc|thang vua roi|thang qua/.test(cleanQ)) {
    return {
      dateFrom: ymd(vn.year, vn.month - 1, 1),
      dateTo: ymd(vn.year, vn.month, 0),
      label: "tháng trước",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/hom nay|ngay hom nay/.test(cleanQ)) {
    return {
      dateFrom: today,
      dateTo: today,
      label: "hôm nay",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/hom qua|ngay hom qua/.test(cleanQ)) {
    const yesterday = ymd(vn.year, vn.month, vn.day - 1);
    return {
      dateFrom: yesterday,
      dateTo: yesterday,
      label: "hôm qua",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/hom kia|ngay hom kia/.test(cleanQ)) {
    const dayBefore = ymd(vn.year, vn.month, vn.day - 2);
    return {
      dateFrom: dayBefore,
      dateTo: dayBefore,
      label: "hôm kia",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/tuan nay|trong tuan nay|dau tuan den nay/.test(cleanQ)) {
    const dayOfWeek = (vn.dayOfWeek + 6) % 7;
    return {
      dateFrom: ymd(vn.year, vn.month, vn.day - dayOfWeek),
      dateTo: today,
      label: "tuần này",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/tuan truoc|tuan vua roi|tuan qua/.test(cleanQ)) {
    const dayOfWeek = (vn.dayOfWeek + 6) % 7;
    return {
      dateFrom: ymd(vn.year, vn.month, vn.day - dayOfWeek - 7),
      dateTo: ymd(vn.year, vn.month, vn.day - dayOfWeek - 1),
      label: "tuần trước",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  const days = /(\d+)\s*ngay/.exec(cleanQ);
  if (days) {
    const count = Math.max(1, Number(days[1]));
    return {
      dateFrom: ymd(vn.year, vn.month, vn.day - (count - 1)),
      dateTo: today,
      label: `${count} ngày gần nhất`,
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/quy nay|trong quy nay/.test(cleanQ)) {
    const startMonth = Math.floor(vn.month / 3) * 3;
    return {
      dateFrom: ymd(vn.year, startMonth, 1),
      dateTo: today,
      label: "quý này",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/quy truoc|quy vua roi/.test(cleanQ)) {
    const currentQStart = Math.floor(vn.month / 3) * 3;
    return {
      dateFrom: ymd(vn.year, currentQStart - 3, 1),
      dateTo: ymd(vn.year, currentQStart, 0),
      label: "quý trước",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  const quarterMatch = /(?:^|\s)quy\s*([1-4])(?:\s*[\/\-]?\s*(?:nam\s*)?(\d{4}))?(?=\s|$|[?,!.])/.exec(cleanQ);
  if (quarterMatch) {
    const qNum = Number(quarterMatch[1]);
    const year = quarterMatch[2] ? Number(quarterMatch[2]) : vn.year;
    const startMonth = (qNum - 1) * 3;
    return {
      dateFrom: ymd(year, startMonth, 1),
      dateTo: ymd(year, startMonth + 3, 0),
      label: `quý ${qNum}${quarterMatch[2] ? `/${year}` : ""}`,
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  const monthMatch =
    /(?:^|\s)(?:thang|thg)\s*(1[0-2]|0?[1-9])(?:\s*[\/\-]\s*(\d{4})|\s+nam\s+(\d{4}))?(?=\s|$|[?,!.])/.exec(
      cleanQ,
    ) ?? /(?:^|\s)t(1[0-2]|0?[1-9])(?:\s*[\/.]\s*(\d{4}))?(?=\s|$|[?,!.])/.exec(cleanQ);
  if (monthMatch) {
    const mNum = Number(monthMatch[1]);
    const yearStr = monthMatch[2] || monthMatch[3];
    const year = yearStr ? Number(yearStr) : vn.year;
    return {
      dateFrom: ymd(year, mNum - 1, 1),
      dateTo: ymd(year, mNum, 0),
      label: `tháng ${mNum}${yearStr ? `/${year}` : ""}`,
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/nam nay|trong nam nay|dau nam den nay/.test(cleanQ)) {
    return {
      dateFrom: ymd(vn.year, 0, 1),
      dateTo: today,
      label: "năm nay",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  if (/nam truoc|nam ngoai/.test(cleanQ)) {
    const y = vn.year - 1;
    return {
      dateFrom: ymd(y, 0, 1),
      dateTo: ymd(y, 11, 31),
      label: "năm trước",
      hasExplicitTime: true,
      clearsDate: false,
    };
  }

  return { dateFrom: null, dateTo: null, label: null, hasExplicitTime: false, clearsDate: false };
}

/** Bộ luật khi chưa có API key, hoặc khi model không điền được stats. */
export function parseStatsQuestion(
  text: string,
  now: Date = new Date(),
  context?: { lastStats?: StatsQuery | null; mentions?: ChatMention[] },
): StatsQuery | null {
  const cleaned = context?.mentions?.length ? stripMentionLabels(text, context.mentions) : text;
  const q = fold(cleaned);
  if (!q) return null;
  if (/(xuat|export|tai ve|file excel|excel|csv)/.test(q)) return null;
  if (/(huong dan|cach dung|la gi\b|y nghia|cong thuc)/.test(q) && !/(bao nhieu|tong|so lieu|du lieu)/.test(q)) {
    return null;
  }

  const time = parseTimeRange(cleaned, now);
  const hasContext = Boolean(context?.lastStats || (context?.mentions && context.mentions.length > 0));

  const asksNumbers =
    /(bao nhieu|so lieu|du lieu|\bdata\b|thong ke|bao cao|tinh hinh|ket qua|doanh so|tong|ty le|phan bo|chi tiet|\bxem\b|\bcheck\b|kiem tra|tra cuu|theo fanpage|tung fanpage|moi fanpage|theo page|tung page|theo chien dich|theo nguon|theo kenh|chi tiet kenh|theo phu trach|theo nhan vien|theo sale|theo trang thai|theo phan loai|theo thuong hieu|theo hang|theo san pham|theo loai san pham|loai san pham|theo dong xe|theo dai ly|theo showroom|theo dia diem|theo dia chi|dia chi|theo chi nhanh|chi nhanh|khu vuc|so voi|so sanh|doi chieu|qua han|khqt|gdtd|khd|ky hop dong|bi loai|mat khach|fail|da lien he|chua lien he|chi phi|chi tieu|ngan sach|quang cao|\bads\b|marketing|ctr|\bcpl\b|luot click|\bclick\b|hien thi|impression|thu cong|nhap tay|\bimport\b|tiktok|zalo|website|landing page|google|hotline|facebook|\bmeta\b|tin nhan|messenger|\binbox\b|comment|binh luan|\bform\b|cuoc goi|chat web|nhieu nhat|thap nhat|cao nhat|re nhat|\btop\b|\blead\b)/.test(
      q,
    );

  const isFollowUpPhrase = /(thi sao|the nao|nhu the nao|ra sao|\bcon\b|vay con|the con|tuong ung|tiep theo)/.test(q);
  const isTimeQuery = time.hasExplicitTime;
  const isContextFollowUp = hasContext && (isFollowUpPhrase || time.hasExplicitTime || wantsResetScope(q));

  if (!asksNumbers && !isTimeQuery && !isContextFollowUp) return null;

  const { dateFrom, dateTo } = time;

  const wantsLowCpl = /cpl/.test(q) && /thap|re nhat|nho nhat/.test(q);
  const wantsMostLeads = /(nhieu lead|lead nhat|thu ve)/.test(q);
  const wantsMostSpend = /(chi tieu nhieu|tieu nhieu nhat|ngan sach cao)/.test(q);
  const ranking = wantsLowCpl || wantsMostLeads || wantsMostSpend || /(nhieu nhat|cao nhat|thap nhat|\btop\b)/.test(q);
  const rankBy: StatsQuery["rankBy"] = wantsLowCpl
    ? "cpl"
    : wantsMostLeads || (ranking && /lead/.test(q))
      ? "leads"
      : wantsMostSpend
        ? "spend"
        : null;
  const topN = rankBy ? 5 : null;
  const campaignQuery = extractCampaignName(q);

  let groupBy: StatsQuery["groupBy"] = null;
  if (/quang cao|\bads\b/.test(q) && (ranking || campaignQuery)) groupBy = "ad";
  else if (/theo fanpage|tung fanpage|moi fanpage|theo page|tung page/.test(q)) groupBy = "fanpage";
  else if (/chien dich|campaign/.test(q) && !campaignQuery) groupBy = "campaign";
  else if (/chi tiet kenh|theo hinh thuc|theo form.*tin nhan|tin nhan.*comment/.test(q)) groupBy = "channelDetail";
  else if (
    /theo nguon|tung nguon|theo kenh|phan bo.*nguon/.test(q) ||
    (/nguon|kenh/.test(q) && !/thu cong|nhap tay|\bimport\b|tiktok|zalo|landing|website|google|hotline|facebook|\bmeta\b/.test(q))
  )
    groupBy = "source";
  else if (/phu trach|nhan vien|\bsale\b/.test(q)) groupBy = "assignee";
  else if (/trang thai|phan loai/.test(q)) groupBy = "category";
  else if (/thuong hieu|hang xe|\bhang\b/.test(q)) groupBy = "brand";
  else if (/dong xe|san pham|loai san pham/.test(q)) groupBy = "product";
  else if (/dai ly|showroom|dia diem|dia chi|chi nhanh|khu vuc/.test(q)) groupBy = "location";

  let pageQuery = extractPageFilter(q);
  if (!pageQuery && groupBy !== "fanpage" && !wantsResetScope(q)) {
    const named =
      /fanpage\s+([a-z0-9][a-z0-9 \-]{1,40}?)(?=\s+vao\b|\s+thang\b|\s+tuan\b|\s+quy\b|\s+hom\b|\s+co\b|\s+bao\b|\s+trong\b|\s+thi\b|$)/.exec(
        q,
      );
    if (named && named[1] !== "nao") pageQuery = named[1].trim();
  }

  const filters: ExportFilters = {};
  if (/khqt|quan tam/.test(q)) filters.categories = /tro len/.test(q) ? ["KHQT", "GDTD", "KHD"] : ["KHQT"];
  else if (/ky hop dong|\bkhd\b/.test(q)) filters.categories = ["KHD"];
  else if (/\bgdtd\b/.test(q)) filters.categories = ["GDTD", "KHD"];
  else if (/fail|bi loai|mat khach/.test(q)) filters.categories = ["FAIL"];

  if (/qua han/.test(q)) filters.overdueOnly = true;
  if (/chua lien he/.test(q)) filters.contactStatus = "CHUA_LIEN_HE";
  else if (/da lien he/.test(q)) filters.contactStatus = "DA_LIEN_HE";

  if (groupBy !== "source") {
    if (/thu cong|nhap tay|\bmanual\b|\bimport\b/.test(q)) filters.sources = ["MANUAL"];
    else if (/tiktok/.test(q)) filters.sources = ["TIKTOK"];
    else if (/zalo/.test(q)) filters.sources = ["ZALO"];
    else if (/landing page|website/.test(q)) filters.sources = ["WEBSITE"];
    else if (/google/.test(q)) filters.sources = ["GOOGLE"];
    else if (/hotline/.test(q)) filters.sources = ["HOTLINE"];
    else if (/facebook|\bmeta\b/.test(q)) filters.sources = ["FACEBOOK"];
  }
  const qNoCampaign = campaignQuery ? q.replace(campaignQuery, " ") : q;
  if (groupBy !== "channelDetail" && groupBy !== "ad") {
    const channelDetails: NonNullable<ExportFilters["channelDetails"]> = [];
    if (/tin nhan|messenger|\binbox\b/.test(qNoCampaign)) channelDetails.push("TIN_NHAN");
    if (/comment|binh luan/.test(qNoCampaign)) channelDetails.push("COMMENT");
    if (/\bform\b|dien form/.test(qNoCampaign)) channelDetails.push("FORM");
    if (/cuoc goi/.test(qNoCampaign)) channelDetails.push("CUOC_GOI");
    if (/chat web/.test(qNoCampaign)) channelDetails.push("CHAT_WEB");
    if (channelDetails.length) {
      filters.channelDetails = channelDetails;
    }
  }

  const parsedResult: StatsQuery = {
    dateFrom,
    dateTo,
    comparePrevious: /so voi|ky truoc|tang|giam/.test(q),
    dataset: datasetFor(q),
    groupBy,
    rankBy,
    topN,
    pageQuery,
    campaignQuery,
    assigneeQuery: null,
    pageIds: null,
    campaignIds: null,
    adIds: null,
    leadIds: null,
    filters,
  };

  if (context?.lastStats) {
    return inheritStatsQuery(parsedResult, context.lastStats, cleaned, now);
  }
  return parsedResult;
}

export function hasExplicitDataset(text: string): boolean {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  const marketing =
    /(chi phi|chi tieu|ngan sach|spend|impression|hien thi|luot click|\bclick\b|ctr|\bcpl\b|quang cao|\bads\b|marketing|hieu qua)/.test(
      q,
    );
  const crm =
    /(lien he|khqt|gdtd|\bkhd\b|qua han|ky hop dong|bi loai|phu trach|nhan vien|trang thai|phan loai|dai ly|showroom|dia diem|dia chi|chi nhanh|khu vuc|loai san pham|san pham|dong xe|chi tiet kenh|tin nhan|messenger|\binbox\b|comment|binh luan|\bform\b|cuoc goi|chat web|crm|thu cong)/.test(
      q,
    );
  return marketing || crm;
}

export function datasetFor(text: string): StatsDataset {
  const rawQ = fold(text);
  const campaign = extractCampaignName(rawQ);
  const q = campaign ? rawQ.replace(campaign, " ") : rawQ;
  const marketing =
    /(chi phi|chi tieu|ngan sach|spend|impression|hien thi|luot click|\bclick\b|ctr|\bcpl\b|quang cao|\bads\b|marketing|hieu qua)/.test(
      q,
    );
  const crm =
    /(lien he|khqt|gdtd|\bkhd\b|qua han|ky hop dong|bi loai|phu trach|nhan vien|trang thai|phan loai|dai ly|showroom|dia diem|dia chi|chi nhanh|khu vuc|loai san pham|san pham|dong xe|chi tiet kenh|tin nhan|messenger|\binbox\b|comment|binh luan|\bform\b|cuoc goi|chat web|crm|thu cong)/.test(
      q,
    );
  if (marketing && crm) return "both";
  if (marketing) return "marketing";
  if (crm) return "leads";
  return "both";
}

export function mentionsAdsMetrics(text: string) {
  return /(quang cao|ads manager|insight|chi phi|ngan sach|spend)/.test(fold(text));
}

