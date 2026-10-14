import type { ViewerScope } from "@/lib/db/leads-repo";
import {
  funnelFromKpis,
  queryByProduct,
  queryBySource,
  queryCallList,
  queryCategoryDistribution,
  queryDailySeries,
  queryFailReasons,
  queryPivot,
  queryReportKpis,
} from "@/lib/db/report-queries";
import { previousCalendarRange } from "@/lib/date-range";
import type {
  CategoryShare,
  DailyPoint,
  FailReasonBar,
  FunnelStep,
  ModelBar,
  PivotDimension,
  PivotResult,
  PivotRow,
  SourceBar,
} from "@/lib/metrics";
import type { Lead, LeadFilters, LeadKpis } from "@/lib/types";

/** Các chiều luôn được tính sẵn để nút xuất Excel của bảng chi tiết và bảng tổng quan dùng ngay. */
export const EXPORT_PIVOT_DIMENSIONS: PivotDimension[] = [
  "source",
  "facebookPage",
  "assignee",
  "category",
  "product",
];

export interface ReportSummary {
  kpis: LeadKpis;
  previousKpis: LeadKpis | null;
  totalLeads: number;
  overview: {
    daily: DailyPoint[];
    funnel: FunnelStep[];
    distribution: CategoryShare[];
    failReasons: FailReasonBar[];
    bySource: SourceBar[];
    byModel: ModelBar[];
    byAssignee: PivotRow[];
    byFanpage: PivotRow[];
    /** Danh sách cần gọi hôm nay — dữ liệu lead duy nhất được gửi ra client. */
    callList: Lead[];
  };
  pivot: {
    current: PivotResult;
    byDimension: Record<string, PivotResult>;
  };
}

export interface ReportSummaryInput {
  filters: LeadFilters;
  groupBy: PivotDimension;
  splitBy: PivotDimension | null;
  now?: Date;
}

/**
 * Tính toàn bộ số liệu của trang báo cáo ở server bằng SQL aggregation.
 *
 * Client chỉ nhận con số (và vài lead trong danh sách gọi) — không kéo cả tập
 * lead ra trình duyệt.
 */
export async function buildReportSummary(
  input: ReportSummaryInput,
  viewer: ViewerScope,
): Promise<ReportSummary> {
  const now = input.now ?? new Date();
  const { filters, groupBy, splitBy } = input;

  let previousFilters: LeadFilters | null = null;
  if (filters.dateFrom && filters.dateTo) {
    const prev = previousCalendarRange(filters.dateFrom, filters.dateTo);
    previousFilters = {
      ...filters,
      dateFrom: prev.from,
      dateTo: prev.to,
    };
  }

  const exportDims = Array.from(new Set<PivotDimension>([groupBy, ...EXPORT_PIVOT_DIMENSIONS]));

  const [
    kpis,
    previousKpis,
    daily,
    distribution,
    failReasons,
    bySource,
    byModel,
    callList,
    splitPivot,
    ...exportPivots
  ] = await Promise.all([
    queryReportKpis(filters, viewer, now),
    previousFilters ? queryReportKpis(previousFilters, viewer, now) : Promise.resolve(null),
    queryDailySeries(filters, viewer, now),
    queryCategoryDistribution(filters, viewer, now),
    queryFailReasons(filters, viewer, now),
    queryBySource(filters, viewer, now),
    queryByProduct(filters, viewer, now, 12),
    queryCallList(filters, viewer, now, 25),
    splitBy ? queryPivot(filters, viewer, now, groupBy, splitBy) : Promise.resolve(null),
    ...exportDims.map((dim) => queryPivot(filters, viewer, now, dim, null)),
  ]);

  const byDimension: Record<string, PivotResult> = {};
  exportDims.forEach((dim, index) => {
    byDimension[dim] = exportPivots[index];
  });
  const currentPivot = splitPivot ?? byDimension[groupBy];
  const funnel = funnelFromKpis(kpis);

  return {
    kpis,
    previousKpis,
    totalLeads: kpis.total,
    overview: {
      daily,
      funnel,
      distribution,
      failReasons,
      bySource,
      byModel,
      byAssignee: byDimension.assignee?.rows ?? [],
      byFanpage: byDimension.facebookPage?.rows ?? [],
      callList,
    },
    pivot: {
      current: currentPivot,
      byDimension,
    },
  };
}
