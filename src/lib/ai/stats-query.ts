import { z } from "zod";

import type { ViewerScope } from "@/lib/db/leads-repo";
import { previousCalendarRange } from "@/lib/date-range";
import { EMPTY_FILTERS } from "@/lib/filters";
import { PIVOT_DIMENSIONS, type PivotDimension } from "@/lib/metrics";
import type { LeadFilters, LeadKpis } from "@/lib/types";
import { formatCurrency, formatNumber, formatPercent, toDateInputValue } from "@/lib/utils";

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

export function pagesInScope(pages: PageOption[], viewer: ViewerScope): PageOption[] {
  if (viewer.role === "SUPER_ADMIN") return pages;
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

const GROUP_LABEL: Record<string, string> = {
  fanpage: "fanpage",
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
}): string {
  if (input.viewer.role !== "SUPER_ADMIN" && input.viewer.pageIds.length === 0) {
    return "Tài khoản chưa được gán fanpage, nên không có lead nào trong phạm vi xem.";
  }

  if (input.unmatchedPage) {
    const names = input.visiblePageNames?.filter(Boolean) ?? [];
    const hint = names.length ? ` Fanpage trong phạm vi: ${names.join(", ")}.` : "";
    return `Không thấy fanpage khớp «${input.unmatchedPage}» trong phạm vi tài khoản.${hint}`;
  }

  const scope =
    input.viewer.role === "SUPER_ADMIN"
      ? "Số liệu trên toàn bộ lead CRM."
      : "Số liệu trong các fanpage được gán cho tài khoản.";

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
      for (const row of input.breakdown) {
        const contactRate = row.contactRate ?? (row.leads > 0 ? row.contacted / row.leads : 0);
        const khqtRate = row.khqtRate ?? (row.contacted > 0 ? row.khqt / row.contacted : (row.leads > 0 ? row.khqt / row.leads : 0));
        const failRate = row.failRate ?? (row.leads > 0 ? row.failed / row.leads : 0);
        lines.push(
          `• ${row.key}: ${formatNumber(row.leads)} lead | LH: ${formatPercent(contactRate)} | KHQT: ${formatPercent(khqtRate)} | Loại: ${formatPercent(failRate)}`,
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

/** Từ khóa trong câu hỏi thắng lựa chọn của model khi model chọn nhầm chiều. */
export function mergeStats(model: StatsQuery | null, local: StatsQuery | null): StatsQuery | null {
  if (!model) return local;
  if (!local) return model;
  return {
    ...model,
    dataset: local.dataset,
    groupBy: local.groupBy ?? model.groupBy,
    rankBy: local.rankBy ?? model.rankBy,
    topN: local.topN ?? model.topN,
    pageQuery: local.pageQuery ?? model.pageQuery,
    campaignQuery: local.campaignQuery ?? model.campaignQuery,
    pageIds: local.pageIds ?? model.pageIds,
    campaignIds: local.campaignIds ?? model.campaignIds,
    adIds: local.adIds ?? model.adIds,
    leadIds: local.leadIds ?? model.leadIds,
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
}): string {
  if (input.viewer.role !== "SUPER_ADMIN" && input.viewer.pageIds.length === 0) {
    return "Tài khoản chưa được gán fanpage, nên không có số quảng cáo trong phạm vi xem.";
  }

  const group = marketingGroupBy(input.query.groupBy);
  const winner = input.query.rankBy ? input.breakdown?.[0] : undefined;
  const lines = [
    "Quảng cáo — lượt trên Ads, không phải lead CRM.",
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
      `${formatNumber(winner.leads)} lượt lead quảng cáo, chi tiêu ${formatCurrency(winner.spend)}, CPL ${rates.cpl === null ? "—" : formatCurrency(rates.cpl)}.`,
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
    lines.push("", input.query.rankBy ? "Top:" : `Theo ${MARKETING_GROUP_LABEL[group]}:`);
    if (input.breakdown.length === 0) {
      lines.push("• Không có số quảng cáo trong kỳ này.");
    } else {
      for (const row of input.breakdown) {
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
  const name = match[1].replace(/\b(thang nay|thang truoc|hom nay)\b/g, "").trim();
  if (!name || /^nao\b/.test(name)) return null;
  return name;
}

export function extractPageFilter(text: string): string | null {
  const q = fold(text);
  if (/theo fanpage|tung fanpage|moi fanpage|theo page|tung page/.test(q)) return null;
  const match = /(?:cua|tren)\s+(?:fanpage|page)\s+(.+?)(?=\s+thang|\s+trong\b|$)/.exec(q);
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
  { id: "product", label: "Sản phẩm" },
  { id: "brand", label: "Thương hiệu" },
  { id: "location", label: "Địa điểm" },
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

/** Bộ luật khi chưa có API key, hoặc khi model không điền được stats. */
export function parseStatsQuestion(text: string, now: Date = new Date()): StatsQuery | null {
  const q = fold(text);
  if (!q) return null;
  if (/(xuat|export|tai ve|file excel|excel|csv)/.test(q)) return null;
  if (/(huong dan|cach dung|la gi\b|y nghia)/.test(q) && !/(bao nhieu|tong)/.test(q)) return null;

  const asksNumbers =
    /(bao nhieu|so lieu|thong ke|tong lead|ty le|phan bo|theo fanpage|tung fanpage|theo page|theo chien dich|theo nguon|theo phu trach|theo trang thai|so voi|qua han|khqt|da lien he|chua lien he|chi phi|chi tieu|ngan sach|quang cao|marketing|ctr|\bcpl\b|luot click|hien thi)/.test(
      q,
    );
  if (!asksNumbers) return null;

  const iso = (date: Date) => toDateInputValue(date.toISOString());
  let dateFrom: string | null = null;
  let dateTo: string | null = null;

  if (/thang nay/.test(q)) {
    dateFrom = iso(new Date(now.getFullYear(), now.getMonth(), 1));
    dateTo = iso(now);
  } else if (/thang truoc/.test(q)) {
    dateFrom = iso(new Date(now.getFullYear(), now.getMonth() - 1, 1));
    dateTo = iso(new Date(now.getFullYear(), now.getMonth(), 0));
  } else if (/hom nay/.test(q)) {
    dateFrom = iso(now);
    dateTo = iso(now);
  } else {
    const days = /(\d+)\s*ngay/.exec(q);
    if (days) {
      const from = new Date(now);
      from.setDate(from.getDate() - (Number(days[1]) - 1));
      dateFrom = iso(from);
      dateTo = iso(now);
    }
  }

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
  else if (/nguon|kenh/.test(q)) groupBy = "source";
  else if (/phu trach|nhan vien/.test(q)) groupBy = "assignee";
  else if (/trang thai|phan loai/.test(q)) groupBy = "category";
  else if (/thuong hieu|hang xe|\bhang\b/.test(q)) groupBy = "brand";
  else if (/dong xe|san pham/.test(q)) groupBy = "product";
  else if (/showroom|dia diem|chi nhanh/.test(q)) groupBy = "location";

  let pageQuery = extractPageFilter(q);
  if (!pageQuery && groupBy !== "fanpage") {
    const named = /fanpage\s+([a-z0-9][a-z0-9 \-]{1,40}?)(?=\s+thang|\s+co\b|\s+bao|\s+trong|$)/.exec(q);
    if (named && named[1] !== "nao") pageQuery = named[1].trim();
  }

  const filters: ExportFilters = {};
  if (/khqt|quan tam/.test(q)) filters.categories = ["KHQT"];
  else if (/fail|bi loai|mat khach/.test(q)) filters.categories = ["FAIL"];
  if (/qua han/.test(q)) filters.overdueOnly = true;
  if (/chua lien he/.test(q)) filters.contactStatus = "CHUA_LIEN_HE";
  else if (/da lien he/.test(q)) filters.contactStatus = "DA_LIEN_HE";

  return {
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
}

export function datasetFor(text: string): StatsDataset {
  const q = fold(text);
  const marketing = /(chi phi|chi tieu|ngan sach|spend|impression|hien thi|luot click|\bclick\b|ctr|\bcpl\b|quang cao|ads|marketing|hieu qua)/.test(
    q,
  );
  const crm = /(lien he|khqt|gdtd|qua han|ky hop dong|bi loai|phu trach|trang thai|showroom|dia diem|crm)/.test(q);
  if (marketing && crm) return "both";
  if (marketing) return "marketing";
  if (crm) return "leads";
  return "both";
}

export function mentionsAdsMetrics(text: string) {
  return /(quang cao|ads manager|insight|chi phi|ngan sach|spend)/.test(fold(text));
}
