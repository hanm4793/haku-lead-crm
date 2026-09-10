"use client";

import * as React from "react";
import { Download, Loader2, Search, TriangleAlert } from "lucide-react";

import { ColumnVisibilityPopover } from "@/components/common/column-visibility";
import { DateRangePicker, resolvePreset, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { Pagination } from "@/components/common/pagination";
import { ALL_COLUMN_TOGGLES, LeadTable, type SortState } from "@/components/leads/lead-table";
import { DEFAULT_VISIBLE_COLUMNS } from "@/components/leads/columns";
import { LeadDetailDialog } from "@/components/leads/lead-detail-dialog";
import { LeadFilterPopover } from "@/components/leads/filter-popover";
import { LeadKpiHeader } from "@/components/leads/kpi-header";
import { useNow } from "@/components/providers/now-provider";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadLogs } from "@/hooks/use-lead-logs";
import { useLeadPage } from "@/hooks/use-lead-page";
import { updateLeadAction } from "@/app/leads/actions";
import type { LeadPage } from "@/lib/db/leads-repo";
import { downloadExport } from "@/lib/export/download";
import { filtersToExportSpec } from "@/lib/export/from-filters";
import type { LeadSearchInput } from "@/lib/leads/query";
import type { ActivityKind, ContactStatus, Lead, LeadCategory, LeadFilters } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/lead-store";

interface LogEntry {
  kind: ActivityKind;
  message: string;
}

const TABS: { id: LeadFilters["tab"]; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "CHUA_LIEN_HE", label: "Chưa liên hệ" },
  { id: "DA_LIEN_HE", label: "Đã liên hệ" },
  { id: "QUA_HAN", label: "Quá hạn" },
];

export function LeadsPage({
  initialData,
  initialRequest,
}: {
  initialData: LeadPage;
  initialRequest: LeadSearchInput;
}) {
  const now = useNow();
  const filters = useLeadStore((s) => s.filters);
  const setFilters = useLeadStore((s) => s.setFilters);
  const resetFilters = useLeadStore((s) => s.resetFilters);

  const [visibleColumns, setVisibleColumns] = React.useState<string[]>(DEFAULT_VISIBLE_COLUMNS);
  const [sort, setSort] = React.useState<SortState>({ columnId: "createdAt", order: "desc" });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialRequest.pageSize);
  const [datePreset, setDatePreset] = React.useState<PresetId>("ALL");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [exporting, setExporting] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(filters.search);
  const [saveError, setSaveError] = React.useState<string | null>(null);

  // Gõ tìm kiếm nhanh nhưng chỉ truy vấn sau khi người dùng ngừng gõ.
  React.useEffect(() => {
    const timer = setTimeout(() => setFilters({ search: searchInput }), 300);
    return () => clearTimeout(timer);
  }, [searchInput, setFilters]);

  // Đổi bộ lọc hoặc cỡ trang thì quay lại trang đầu — điều chỉnh ngay trong lúc
  // render thay vì dùng effect để tránh một lượt truy vấn thừa ở trang cũ.
  const pagingKey = `${JSON.stringify(filters)}|${pageSize}|${sort.columnId}|${sort.order}`;
  const [lastPagingKey, setLastPagingKey] = React.useState(pagingKey);
  if (pagingKey !== lastPagingKey) {
    setLastPagingKey(pagingKey);
    setPage(1);
  }

  const request = React.useMemo<LeadSearchInput>(
    () => ({ filters, sortBy: sort.columnId, sortOrder: sort.order, page, pageSize }),
    [filters, sort, page, pageSize],
  );

  const { data, loading, error, patchRows, refetch } = useLeadPage(initialData, initialRequest, request);

  const selected = selectedId ? (data.rows.find((row) => row.id === selectedId) ?? null) : null;
  const { logs: selectedLogs, reload: reloadLogs } = useLeadLogs(selectedId);

  const handleDateChange = (preset: PresetId, range: DateRange) => {
    setDatePreset(preset);
    const resolved = preset === "CUSTOM" ? range : resolvePreset(preset, now);
    setFilters({ dateFrom: resolved.from, dateTo: resolved.to });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExport(filtersToExportSpec(filters, visibleColumns));
    } finally {
      setExporting(false);
    }
  };

  /**
   * Sửa ngay trên giao diện rồi mới gọi server. Nếu server từ chối thì hoàn tác
   * và hiện lỗi, còn thành công thì tải lại để KPI và số trên tab khớp lại.
   */
  const save = async (lead: Lead, patch: Partial<Lead>, logs: LogEntry[]) => {
    const revert = patchRows([{ id: lead.id, patch }]);
    setSaveError(null);

    const result = await updateLeadAction({ id: lead.id, patch, logs });
    if (!result.ok) {
      revert();
      setSaveError(result.error);
      return;
    }

    refetch();
    if (selectedId === lead.id) reloadLogs();
  };

  const handleStatusChange = (lead: Lead, next: ContactStatus) => {
    if (lead.contactStatus === next) return;
    void save(lead, { contactStatus: next }, [
      {
        kind: "STATUS_CHANGE",
        message: `Đổi trạng thái: ${lead.contactStatus === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ"} → ${next === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ"}.`,
      },
    ]);
  };

  const handleCategoryChange = (lead: Lead, next: LeadCategory) => {
    if (lead.category === next) return;
    void save(lead, { category: next, failReason: next === "FAIL" ? lead.failReason : null }, [
      { kind: "CATEGORY_CHANGE", message: `Cập nhật phân loại trực tiếp trên bảng: ${next}.` },
    ]);
  };

  const banner = error ?? saveError;

  return (
    <div className="flex h-[calc(100vh-33px)] flex-col gap-3 p-4">
      <LeadKpiHeader kpis={data.kpis} />

      {banner && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          <TriangleAlert className="size-4 shrink-0" />
          {banner}
        </div>
      )}

      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <Tabs value={filters.tab} onValueChange={(v) => setFilters({ tab: v as LeadFilters["tab"] })}>
            <TabsList className="gap-0">
              {TABS.map((tab) => (
                <TabsTrigger
                  key={tab.id}
                  value={tab.id}
                  className="border-b-0 data-[state=active]:bg-accent data-[state=active]:rounded-md"
                >
                  {tab.label}
                  <span
                    className={cn(
                      "rounded px-1 text-[11px] tabular-nums",
                      filters.tab === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground",
                    )}
                  >
                    {data.tabCounts[tab.id]}
                  </span>
                </TabsTrigger>
              ))}
            </TabsList>
          </Tabs>

          <div className="relative w-56">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              placeholder="Tìm tên / SĐT"
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          <DateRangePicker
            preset={datePreset}
            range={{ from: filters.dateFrom, to: filters.dateTo }}
            onChange={handleDateChange}
          />

          <LeadFilterPopover
            filters={filters}
            onChange={setFilters}
            onReset={() => {
              resetFilters();
              setSearchInput("");
              setDatePreset("ALL");
            }}
          />

          <div className="ml-auto flex items-center gap-2">
            {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Xuất Excel
            </Button>
            <ColumnVisibilityPopover
              columns={ALL_COLUMN_TOGGLES}
              visible={visibleColumns}
              onChange={setVisibleColumns}
              defaults={DEFAULT_VISIBLE_COLUMNS}
            />
          </div>
        </div>

        <LeadTable
          leads={data.rows}
          visibleColumns={visibleColumns}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(lead) => setSelectedId(lead.id)}
          onStatusChange={handleStatusChange}
          onCategoryChange={handleCategoryChange}
        />

        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPageChange={setPage}
          onPageSizeChange={setPageSize}
        />
      </div>

      <LeadDetailDialog
        lead={selected}
        logs={selectedLogs}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        onSave={(patch, entries) => selected && void save(selected, patch, entries)}
      />
    </div>
  );
}
