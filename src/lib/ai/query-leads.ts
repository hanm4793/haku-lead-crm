import { type LeadCriteria, queryLeadsByCriteria, type ViewerScope } from "@/lib/db/leads-repo";
import type { Lead } from "@/lib/types";

import type { ExportFilters, ExportSpec } from "./export-spec";

export type { ViewerScope };

/** Đổi bộ lọc do AI sinh ra sang tiêu chí chung của repository. */
export function criteriaFromExportFilters(filters: ExportFilters | undefined): LeadCriteria {
  const f = filters ?? {};
  return {
    search: f.search ?? undefined,
    dateField: f.dateField,
    dateFrom: f.dateFrom ?? null,
    dateTo: f.dateTo ?? null,
    contactStatus: f.contactStatus ?? null,
    categories: f.categories as LeadCriteria["categories"],
    failReasons: f.failReasons as LeadCriteria["failReasons"],
    sources: f.sources as LeadCriteria["sources"],
    brands: f.brands as LeadCriteria["brands"],
    showrooms: f.showrooms,
    salesRooms: f.salesRooms,
    assignees: f.assignees,
    carModels: f.carModels,
    b10: f.b10,
    overdueOnly: f.overdueOnly,
  };
}

/**
 * Chạy truy vấn từ "đơn hàng export" mà AI tạo ra.
 *
 * AI không sinh SQL và không chọn được phạm vi dữ liệu: nó chỉ điền vào spec,
 * còn `viewer` do server tự lấy từ session nên bộ lọc sai nhất cũng không vượt
 * ra ngoài quyền của người đang đăng nhập.
 */
export async function queryLeads(spec: ExportSpec, viewer: ViewerScope, now?: Date): Promise<Lead[]> {
  return queryLeadsByCriteria(criteriaFromExportFilters(spec.filters), viewer, {
    sortBy: spec.sortBy,
    sortOrder: spec.sortOrder,
    limit: spec.limit,
    now,
  });
}
