import type { ViewerScope } from "@/lib/db/leads-repo";
import {
  queryByProduct,
  queryBySource,
  queryCallList,
  queryCategoryDistribution,
  queryDailySeries,
  queryFailReasons,
  queryFunnel,
  queryPivot,
  queryReportKpis,
  querySourceQuality,
} from "@/lib/db/report-queries";
import { previousCalendarRange } from "@/lib/date-range";
import type {
  CategoryShare,
  DailyPoint,
  FailReasonRow,
  FunnelStep,
  ModelBar,
  PivotDimension,
  PivotResult,
  SourceBar,
  SourceQualityRow,
} from "@/lib/metrics";
import type { Lead, LeadFilters, LeadKpis } from "@/lib/types";

/** Các chiều luôn được tính sẵn để nút xuất Excel của bảng chi tiết dùng ngay. */
export const EXPORT_PIVOT_DIMENSIONS: PivotDimension[] = ["product", "source", "category"];

export interface ReportSummary {
  kpis: LeadKpis;
  previousKpis: LeadKpis | null;
  totalLeads: number;
  overview: {
    daily: DailyPoint[];
    funnel: FunnelStep[];
    distribution: CategoryShare[];
    bySource: SourceBar[];
    byModel: ModelBar[];
    /** Danh sách cần gọi hôm nay — dữ liệu lead duy nhất được gửi ra client. */
    callList: Lead[];
  };
  loss: {
    reasons: FailReasonRow[];
    sourceQuality: SourceQualityRow[];
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

  const [
    kpis,
    previousKpis,
    daily,
    funnel,
    distribution,
    bySource,
    byModel,
    callList,
    reasons,
    sourceQuality,
    currentPivot,
    ...exportPivots
  ] = await Promise.all([
    queryReportKpis(filters, viewer, now),
    previousFilters ? queryReportKpis(previousFilters, viewer, now) : Promise.resolve(null),
    queryDailySeries(filters, viewer, now),
    queryFunnel(filters, viewer, now),
    queryCategoryDistribution(filters, viewer, now),
    queryBySource(filters, viewer, now),
    queryByProduct(filters, viewer, now, 12),
    queryCallList(filters, viewer, now, 12),
    queryFailReasons(filters, viewer, now),
    querySourceQuality(filters, previousFilters, viewer, now),
    queryPivot(filters, viewer, now, groupBy, splitBy),
    ...EXPORT_PIVOT_DIMENSIONS.map((dim) => queryPivot(filters, viewer, now, dim, null)),
  ]);

  const byDimension: Record<string, PivotResult> = {};
  EXPORT_PIVOT_DIMENSIONS.forEach((dim, index) => {
    byDimension[dim] = exportPivots[index];
  });

  return {
    kpis,
    previousKpis,
    totalLeads: kpis.total,
    overview: {
      daily,
      funnel,
      distribution,
      bySource,
      byModel,
      callList,
    },
    loss: {
      reasons,
      sourceQuality,
    },
    pivot: {
      current: currentPivot,
      byDimension,
    },
  };
}
