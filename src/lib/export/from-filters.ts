import type { ExportSpec } from "@/lib/ai/export-spec";
import type { LeadFilters } from "@/lib/types";

/** Chuyển bộ lọc đang mở trên màn danh sách thành một export spec tương đương. */
export function filtersToExportSpec(filters: LeadFilters, columns: string[]): ExportSpec {
  return {
    title: "danh-sach-lead",
    summary: "Xuất danh sách lead theo bộ lọc đang áp dụng trên màn hình.",
    filters: {
      search: filters.search || undefined,
      dateField: "createdAt",
      dateFrom: filters.dateFrom,
      dateTo: filters.dateTo,
      contactStatus:
        filters.tab === "CHUA_LIEN_HE" ? "CHUA_LIEN_HE" : filters.tab === "DA_LIEN_HE" ? "DA_LIEN_HE" : null,
      overdueOnly: filters.tab === "QUA_HAN" || undefined,
      categories: filters.categories.length ? filters.categories : undefined,
      failReasons: filters.failReasons.length ? filters.failReasons : undefined,
      sources: filters.sources.length ? filters.sources : undefined,
      brands: filters.brands.length ? filters.brands : undefined,
      carModels: filters.carModels.length ? filters.carModels : undefined,
      showrooms: filters.showrooms.length ? filters.showrooms : undefined,
      salesRooms: filters.salesRooms.length ? filters.salesRooms : undefined,
      assignees: filters.assignees.length ? filters.assignees : undefined,
      b10: filters.b10,
    },
    columns,
    splitSheetsBy: null,
    sortBy: "createdAt",
    sortOrder: "desc",
    includeSummarySheet: true,
    format: "xlsx",
  };
}
