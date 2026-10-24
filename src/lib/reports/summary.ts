import { CATEGORY_CHART_LABEL } from "@/lib/constants";
import type { ViewerScope } from "@/lib/db/leads-repo";
import {
  funnelFromKpis,
  queryCallList,
  queryDailySeries,
  queryFailReasons,
  queryPivot,
  queryReportKpis,
} from "@/lib/db/report-queries";
import { previousCalendarRange } from "@/lib/date-range";
import { getLatestDataTimestamp } from "@/lib/facebook/last-sync";
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
import { ratio } from "@/lib/utils";

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
  lastUpdatedAt?: string | null;
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

const CATEGORY_ORDER = ["CHUA_PHAN_LOAI", "KHQT", "GDTD", "KHD", "CHUA_LH_DUOC", "FAIL"] as const;

/**
 * Tính toàn bộ số liệu của trang báo cáo ở server bằng SQL aggregation.
 *
 * Tối ưu: Tái sử dụng kết quả của `exportPivots` (`source`, `category`, `product`)
 * để suy ra `kpis`, `bySource`, `byModel`, và `distribution` mà không phải bắn
 * thêm 4 truy vấn GROUP BY / COUNT trùng lặp xuống Postgres.
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
    previousKpis,
    daily,
    failReasons,
    callList,
    splitPivot,
    lastUpdatedAt,
    ...exportPivots
  ] = await Promise.all([
    previousFilters ? queryReportKpis(previousFilters, viewer, now) : Promise.resolve(null),
    queryDailySeries(filters, viewer, now),
    queryFailReasons(filters, viewer, now),
    queryCallList(filters, viewer, now, 25),
    splitBy ? queryPivot(filters, viewer, now, groupBy, splitBy) : Promise.resolve(null),
    getLatestDataTimestamp(viewer.activeProjectId),
    ...exportDims.map((dim) => queryPivot(filters, viewer, now, dim, null)),
  ]);

  const byDimension: Record<string, PivotResult> = {};
  exportDims.forEach((dim, index) => {
    byDimension[dim] = exportPivots[index];
  });
  const currentPivot = splitPivot ?? byDimension[groupBy];

  // Suy ra KPI kỳ hiện tại trực tiếp từ dòng tổng của bảng pivot `source`
  const pivotTotal = byDimension.source?.total ?? currentPivot.total;
  const kpis: LeadKpis = {
    total: pivotTotal.leads,
    contacted: pivotTotal.contacted,
    uncontacted: Math.max(0, pivotTotal.leads - pivotTotal.contacted),
    contactRate: ratio(pivotTotal.contacted, pivotTotal.leads),
    khqt: pivotTotal.khqt,
    khqtRate: ratio(pivotTotal.khqt, pivotTotal.contacted),
    gdtd: pivotTotal.gdtd,
    khd: pivotTotal.khd,
    failed: pivotTotal.failed,
    failRate: ratio(pivotTotal.failed, pivotTotal.leads),
    overdue: pivotTotal.overdue,
  };

  // Suy ra phân bổ trạng thái (distribution) từ pivot `category`
  const byCategoryLabel = new Map(
    (byDimension.category?.rows ?? []).map((row) => [row.key, row.leads]),
  );
  const distribution: CategoryShare[] = CATEGORY_ORDER
    .map((category) => ({
      category,
      label: CATEGORY_CHART_LABEL[category],
      value: byCategoryLabel.get(CATEGORY_CHART_LABEL[category]) ?? 0,
    }))
    .filter((item) => item.value > 0);

  // Suy ra theo kênh (bySource) và theo dòng sản phẩm (byModel) từ pivot `source` và `product`
  const bySource: SourceBar[] = (byDimension.source?.rows ?? []).map((row) => ({
    source: row.key,
    leads: row.leads,
    khqt: row.khqt,
  }));

  const byModel: ModelBar[] = (byDimension.product?.rows ?? []).slice(0, 12).map((row) => ({
    model: row.key,
    leads: row.leads,
    khqt: row.khqt,
  }));

  const funnel = funnelFromKpis(kpis);

  return {
    kpis,
    previousKpis,
    totalLeads: kpis.total,
    lastUpdatedAt,
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
