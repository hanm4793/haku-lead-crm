import type { ExportSpec } from "@/lib/ai/export-spec";
import { EMPTY_FILTERS } from "@/lib/filters";
import type { Brand, FailReason, LeadCategory, LeadFilters, LeadSource } from "@/lib/types";

/** Chiều ngược của filtersToExportSpec — để nút "Áp lên danh sách" hoạt động. */
export function exportSpecToFilters(spec: ExportSpec): LeadFilters {
  const f = spec.filters ?? {};
  return {
    ...EMPTY_FILTERS,
    search: f.search ?? "",
    tab: f.overdueOnly
      ? "QUA_HAN"
      : f.contactStatus === "CHUA_LIEN_HE"
        ? "CHUA_LIEN_HE"
        : f.contactStatus === "DA_LIEN_HE"
          ? "DA_LIEN_HE"
          : "ALL",
    dateFrom: f.dateFrom ?? null,
    dateTo: f.dateTo ?? null,
    sources: (f.sources ?? []) as LeadSource[],
    brands: (f.brands ?? []) as Brand[],
    showrooms: f.showrooms ?? [],
    salesRooms: f.salesRooms ?? [],
    assignees: f.assignees ?? [],
    carModels: f.carModels ?? [],
    categories: (f.categories ?? []) as LeadCategory[],
    failReasons: (f.failReasons ?? []) as FailReason[],
    b10: f.b10 ?? "ALL",
  };
}
