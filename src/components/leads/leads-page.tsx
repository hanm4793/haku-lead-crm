"use client";

import * as React from "react";
import {
  CheckCircle2,
  ChevronDown,
  Download,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Plus,
  Search,
  Shuffle,
  UserPlus,
  X,
} from "lucide-react";

import { ColumnVisibilityPopover } from "@/components/common/column-visibility";
import { DateRangePicker, resolvePreset, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { Pagination } from "@/components/common/pagination";
import { ALL_COLUMN_TOGGLES, LeadTable, type SortState } from "@/components/leads/lead-table";
import { attrColumnId, buildAttrColumns, columnHeader, DEFAULT_VISIBLE_COLUMNS } from "@/components/leads/columns";
import { CreateLeadDialog } from "@/components/leads/create-lead-dialog";
import { ImportLeadsDialog } from "@/components/leads/import-leads-dialog";
import { LeadDetailDialog } from "@/components/leads/lead-detail-dialog";
import { LeadFilterPopover, type FanpageFilterOption } from "@/components/leads/filter-popover";
import { LeadKpiHeader } from "@/components/leads/kpi-header";
import { useNow } from "@/components/providers/now-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadLogs } from "@/hooks/use-lead-logs";
import { useLeadPage } from "@/hooks/use-lead-page";
import {
  appendActivityLogAction,
  autoAssignLeadsAction,
  bulkUpdateLeadsAction,
  updateLeadAction,
} from "@/app/leads/actions";
import {
  canCreateLead,
  canEditLead,
  canEditLeadProfile,
  canImportLeads,
  type UserRole,
} from "@/lib/auth/roles";
import { DEFAULT_LEAD_CATALOG, type LeadCatalogOptions } from "@/lib/catalog";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { LeadPage } from "@/lib/db/leads-repo";
import { downloadExport } from "@/lib/export/download";
import { filtersToExportSpec } from "@/lib/export/from-filters";
import { countActiveFilters } from "@/lib/filters";
import type { LeadSearchInput } from "@/lib/leads/query";
import type { ActivityKind, ContactStatus, FailReason, Lead, LeadCategory, LeadFilters } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/lead-store";

interface LogEntry {
  kind: ActivityKind;
  message: string;
  byAi?: boolean;
}

const NO_ATTR_FIELDS: AttrFieldRow[] = [];

const TABS: { id: LeadFilters["tab"]; label: string }[] = [
  { id: "ALL", label: "Tất cả" },
  { id: "CHUA_LIEN_HE", label: "Chưa liên hệ" },
  { id: "DA_LIEN_HE", label: "Đã liên hệ" },
  { id: "QUA_HAN", label: "Quá hạn" },
];

export function LeadsPage({
  initialData,
  initialRequest,
  fanpageOptions = [],
  assignees = [],
  catalog = DEFAULT_LEAD_CATALOG,
  attrFields = NO_ATTR_FIELDS,
  editor,
}: {
  initialData: LeadPage;
  initialRequest: LeadSearchInput;
  fanpageOptions?: FanpageFilterOption[];
  assignees?: string[];
  catalog?: LeadCatalogOptions;
  attrFields?: AttrFieldRow[];
  editor?: { role: UserRole; appUserId?: string | null; fullName?: string | null };
}) {
  const now = useNow();
  const toast = useToast();
  const filters = useLeadStore((s) => s.filters);
  const setFilters = useLeadStore((s) => s.setFilters);
  const resetFilters = useLeadStore((s) => s.resetFilters);

  // Field phụ đã cấu hình hiện thành cột (mặc định bật). Người dùng tự chọn cột thì giữ
  // lựa chọn đó cho đến khi danh sách field của project đổi, lúc đó dùng lại mặc định.
  const attrSignature = attrFields.map((f) => f.key).join("|");
  const defaultColumns = React.useMemo(
    () => [...DEFAULT_VISIBLE_COLUMNS, ...attrFields.map((f) => attrColumnId(f.key))],
    [attrFields],
  );
  const columnToggles = React.useMemo(
    () => [
      ...ALL_COLUMN_TOGGLES.map((c) => ({ id: c.id, header: columnHeader(c.id, catalog.labels) })),
      ...buildAttrColumns(attrFields).map((c) => ({ id: c.id, header: c.header })),
    ],
    [attrFields, catalog.labels],
  );
  const [customColumns, setCustomColumns] = React.useState<{ signature: string; ids: string[] } | null>(null);
  const visibleColumns = customColumns?.signature === attrSignature ? customColumns.ids : defaultColumns;
  const setVisibleColumns = (ids: string[]) => setCustomColumns({ signature: attrSignature, ids });
  const [sort, setSort] = React.useState<SortState>({ columnId: "createdAt", order: "desc" });
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialRequest.pageSize);
  const [datePreset, setDatePreset] = React.useState<PresetId>("ALL");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [selectedIds, setSelectedIds] = React.useState<string[]>([]);
  const [bulkLoading, setBulkLoading] = React.useState(false);
  const [exporting, setExporting] = React.useState(false);
  const [createOpen, setCreateOpen] = React.useState(false);
  const [importOpen, setImportOpen] = React.useState(false);
  const [downloadingTemplate, setDownloadingTemplate] = React.useState(false);
  const [searchInput, setSearchInput] = React.useState(filters.search);
  const [lastStoreSearch, setLastStoreSearch] = React.useState(filters.search);
  if (filters.search !== lastStoreSearch) {
    setLastStoreSearch(filters.search);
    setSearchInput(filters.search);
  }

  // Đọc tham số ?page= hoặc ?search= từ URL (ví dụ liên kết sâu từ trợ lý AI)
  React.useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const pageParam = params.get("page")?.trim();
    const searchParam = params.get("search")?.trim();
    const nextPatch: Partial<LeadFilters> = {};
    if (pageParam) {
      const matchedPage = fanpageOptions.find(
        (fp) => fp.value === pageParam || fp.label.toLowerCase() === pageParam.toLowerCase(),
      );
      nextPatch.facebookPageIds = [matchedPage ? matchedPage.value : pageParam];
    }
    if (searchParam) {
      nextPatch.search = searchParam;
    }
    if (Object.keys(nextPatch).length > 0) {
      setFilters(nextPatch);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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
    setSelectedIds([]);
  }

  const request = React.useMemo<LeadSearchInput>(
    () => ({ filters, sortBy: sort.columnId, sortOrder: sort.order, page, pageSize }),
    [filters, sort, page, pageSize],
  );

  const { data, loading, error, patchRows, refetch } = useLeadPage(initialData, initialRequest, request);

  React.useEffect(() => {
    if (error) toast.error("Không tải được danh sách lead", error);
  }, [error, toast]);

  const selected = selectedId ? (data.rows.find((row) => row.id === selectedId) ?? null) : null;
  const selectedIndex = selectedId ? data.rows.findIndex((row) => row.id === selectedId) : -1;
  const prevLeadId = selectedIndex > 0 ? (data.rows[selectedIndex - 1]?.id ?? null) : null;
  const nextLeadId =
    selectedIndex >= 0 && selectedIndex < data.rows.length - 1
      ? (data.rows[selectedIndex + 1]?.id ?? null)
      : null;

  const leadEditable = (lead: Lead) => (editor ? canEditLead(editor, lead) : true);
  const leadProfileEditable = (lead: Lead) =>
    editor ? canEditLeadProfile(editor, lead) : lead.source === "MANUAL";
  const allowCreate = editor ? canCreateLead(editor.role) : true;
  const allowImport = editor ? canImportLeads(editor.role) : true;
  const allowAssign = editor ? editor.role === "SUPER_ADMIN" || editor.role === "PARTNER_ADMIN" : true;
  const { logs: selectedLogs, loading: logsLoading, reload: reloadLogs } = useLeadLogs(selectedId);

  const hasActiveFilters =
    countActiveFilters(filters) > 0 ||
    Boolean(filters.search.trim()) ||
    Boolean(filters.dateFrom || filters.dateTo);

  const handleResetAllFilters = () => {
    resetFilters();
    setSearchInput("");
    setDatePreset("ALL");
  };

  const handleDateChange = (preset: PresetId, range: DateRange) => {
    setDatePreset(preset);
    const resolved = preset === "CUSTOM" ? range : resolvePreset(preset, now);
    setFilters({ dateFrom: resolved.from, dateTo: resolved.to });
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      await downloadExport(filtersToExportSpec(filters, visibleColumns));
    } catch (err) {
      toast.error(
        "Không xuất được file Excel",
        err instanceof Error ? err.message : "Vui lòng thử lại sau.",
      );
    } finally {
      setExporting(false);
    }
  };

  const handleDownloadTemplate = async () => {
    setDownloadingTemplate(true);
    try {
      const response = await fetch("/api/leads/template");
      if (!response.ok) {
        toast.error("Không tải được file mẫu");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "lead-import-template.xlsx";
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.info("Đã tải file lead mẫu");
    } catch {
      toast.error("Không tải được file mẫu");
    } finally {
      setDownloadingTemplate(false);
    }
  };

  /**
   * Sửa ngay trên giao diện rồi mới gọi server. Nếu server từ chối thì hoàn tác
   * và hiện lỗi, còn thành công thì tải lại để KPI và số trên tab khớp lại.
   */
  const save = async (lead: Lead, patch: Partial<Lead>, logs: LogEntry[]): Promise<boolean> => {
    const revert = patchRows([{ id: lead.id, patch }]);

    const result = await updateLeadAction({ id: lead.id, patch, logs });
    if (!result.ok) {
      revert();
      toast.error("Không lưu được thay đổi", result.error);
      return false;
    }

    toast.success("Đã lưu thay đổi");
    refetch();
    if (selectedId === lead.id) reloadLogs();
    return true;
  };

  const handleStatusChange = (lead: Lead, next: ContactStatus) => {
    if (!leadEditable(lead) || lead.contactStatus === next) return;
    void save(lead, { contactStatus: next }, [
      {
        kind: "STATUS_CHANGE",
        message: `Đổi trạng thái: ${lead.contactStatus === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ"} → ${next === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ"}.`,
      },
    ]);
  };

  const handleCategoryChange = (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => {
    const nextFailReason = next === "FAIL" ? (failReason !== undefined ? failReason : lead.failReason) : null;
    if (!leadEditable(lead) || (lead.category === next && lead.failReason === nextFailReason)) return;
    void save(lead, { category: next, failReason: nextFailReason }, [
      {
        kind: "CATEGORY_CHANGE",
        message: `Cập nhật phân loại trực tiếp trên bảng: ${next}${nextFailReason ? ` (${nextFailReason})` : ""}.`,
      },
    ]);
  };

  const handleAssigneeChange = (lead: Lead, next: string | null) => {
    if (!allowAssign || lead.assignee === next) return;
    void save(lead, { assignee: next }, [
      {
        kind: "ASSIGN_CHANGE",
        message: `Đổi người phụ trách trực tiếp trên bảng: ${lead.assignee ?? "Chưa giao"} → ${next ?? "Chưa giao"}.`,
      },
    ]);
  };

  const handleLogCall = async (lead: Lead, kind: "CALL" | "MISSED_CALL", message: string): Promise<boolean> => {
    if (!leadEditable(lead)) return false;
    const res = await appendActivityLogAction({ leadId: lead.id, kind, message });
    if (!res.ok) {
      toast.error("Không ghi nhận được cuộc gọi", res.error);
      return false;
    }
    toast.success(kind === "CALL" ? "Đã ghi nhận cuộc gọi" : "Đã ghi nhận cuộc gọi nhỡ");
    refetch();
    if (selectedId === lead.id) reloadLogs();
    return true;
  };

  const handleBulkAssign = async (assignee: string | null) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await bulkUpdateLeadsAction({ ids: selectedIds, patch: { assignee } });
      if (!res.ok) {
        toast.error("Không giao được lead hàng loạt", res.error);
        return;
      }
      toast.success(`Đã cập nhật người phụ trách cho ${res.updatedCount} lead`);
      setSelectedIds([]);
      refetch();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleBulkStatus = async (contactStatus: ContactStatus) => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await bulkUpdateLeadsAction({ ids: selectedIds, patch: { contactStatus } });
      if (!res.ok) {
        toast.error("Không đổi được trạng thái hàng loạt", res.error);
        return;
      }
      toast.success(`Đã đổi trạng thái liên hệ cho ${res.updatedCount} lead`);
      setSelectedIds([]);
      refetch();
    } finally {
      setBulkLoading(false);
    }
  };

  const handleAutoAssignRoundRobin = async () => {
    if (selectedIds.length === 0) return;
    setBulkLoading(true);
    try {
      const res = await autoAssignLeadsAction(selectedIds);
      if (!res.ok) {
        toast.error("Không thể chia tự động", res.error);
        return;
      }
      toast.success(`Đã chia tự động (Round-Robin) ${res.assignedCount} lead`);
      setSelectedIds([]);
      refetch();
    } finally {
      setBulkLoading(false);
    }
  };

  return (
    <div className="flex h-[calc(100vh-74px)] flex-col gap-3 p-4">
      <LeadKpiHeader kpis={data.kpis} />

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
            fanpageOptions={fanpageOptions}
            assigneeOptions={assignees}
            catalog={catalog}
            onChange={setFilters}
            onReset={handleResetAllFilters}
          />

          {hasActiveFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={handleResetAllFilters}
              className="h-8 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <X className="size-3.5" />
              Xóa lọc
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}

            {allowCreate && (
              <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
                <Plus className="size-3.5" />
                Tạo lead mới
              </Button>
            )}

            {allowImport && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-1.5"
                    disabled={downloadingTemplate}
                  >
                    {downloadingTemplate ? (
                      <Loader2 className="size-3.5 animate-spin" />
                    ) : (
                      <FileUp className="size-3.5" />
                    )}
                    Import lead
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem onSelect={() => setImportOpen(true)} className="gap-2">
                    <FileUp className="size-4 text-primary" />
                    Import lead từ Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={handleDownloadTemplate} className="gap-2">
                    <FileSpreadsheet className="size-4 text-emerald-600" />
                    Tải lead mẫu (.xlsx)
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}

            <Button variant="outline" size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
              {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              Xuất Excel
            </Button>
            <ColumnVisibilityPopover
              columns={columnToggles}
              visible={visibleColumns}
              onChange={setVisibleColumns}
              defaults={defaultColumns}
            />
          </div>
        </div>

        {selectedIds.length > 0 && (
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-primary/20 bg-primary/5 px-3 py-2 text-xs">
            <div className="flex items-center gap-2 font-medium text-primary">
              <span>Đã chọn {selectedIds.length} lead</span>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs text-slate-600 hover:text-slate-900"
                disabled={bulkLoading}
                onClick={() => setSelectedIds([])}
              >
                Bỏ chọn
              </Button>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {allowAssign && (
                <>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-white text-xs" disabled={bulkLoading}>
                        <UserPlus className="size-3.5" />
                        Giao phụ trách
                        <ChevronDown className="size-3 opacity-60" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="max-h-64 w-52 overflow-y-auto">
                      <DropdownMenuItem onSelect={() => void handleBulkAssign(null)}>
                        Chưa giao (Bỏ phân bổ)
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      {assignees.map((name) => (
                        <DropdownMenuItem key={name} onSelect={() => void handleBulkAssign(name)}>
                          {name}
                        </DropdownMenuItem>
                      ))}
                    </DropdownMenuContent>
                  </DropdownMenu>

                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-7 gap-1.5 bg-white text-xs"
                    disabled={bulkLoading}
                    onClick={() => void handleAutoAssignRoundRobin()}
                  >
                    {bulkLoading ? <Loader2 className="size-3.5 animate-spin" /> : <Shuffle className="size-3.5" />}
                    Chia tự động (Round-Robin)
                  </Button>
                </>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm" className="h-7 gap-1.5 bg-white text-xs" disabled={bulkLoading}>
                    <CheckCircle2 className="size-3.5" />
                    Đổi trạng thái liên hệ
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem onSelect={() => void handleBulkStatus("DA_LIEN_HE")}>
                    Đã liên hệ
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => void handleBulkStatus("CHUA_LIEN_HE")}>
                    Chưa liên hệ
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </div>
        )}

        <LeadTable
          leads={data.rows}
          visibleColumns={visibleColumns}
          sort={sort}
          onSortChange={setSort}
          onRowClick={(lead) => setSelectedId(lead.id)}
          onStatusChange={handleStatusChange}
          onCategoryChange={handleCategoryChange}
          onAssigneeChange={handleAssigneeChange}
          canEdit={leadEditable}
          canAssign={allowAssign}
          assignees={assignees}
          attrFields={attrFields}
          labels={catalog.labels}
          selectedIds={selectedIds}
          onSelectedIdsChange={setSelectedIds}
          hasActiveFilters={hasActiveFilters}
          onResetFilters={handleResetAllFilters}
        />

        <Pagination
          page={page}
          pageSize={pageSize}
          total={data.total}
          onPageChange={(nextPage) => {
            setPage(nextPage);
            setSelectedIds([]);
          }}
          onPageSizeChange={setPageSize}
        />
      </div>

      <LeadDetailDialog
        lead={selected}
        logs={selectedLogs}
        logsLoading={logsLoading}
        open={Boolean(selected)}
        onOpenChange={(open) => !open && setSelectedId(null)}
        assignees={assignees}
        catalog={catalog}
        attrFields={attrFields}
        readOnly={selected ? !leadEditable(selected) : false}
        canEditProfile={selected ? leadProfileEditable(selected) : false}
        canAssign={allowAssign}
        onPrev={prevLeadId ? () => setSelectedId(prevLeadId) : undefined}
        onNext={nextLeadId ? () => setSelectedId(nextLeadId) : undefined}
        onLogCall={selected ? (kind, msg) => handleLogCall(selected, kind, msg) : undefined}
        onSave={(patch, entries) => (selected && leadEditable(selected) ? save(selected, patch, entries) : false)}
      />

      <CreateLeadDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        assignees={assignees}
        catalog={catalog}
        attrFields={attrFields}
        editor={editor}
        onCreated={(newLead) => {
          refetch();
          setSelectedId(newLead.id);
        }}
      />

      <ImportLeadsDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        onDownloadTemplate={handleDownloadTemplate}
        onImported={() => {
          refetch();
        }}
      />
    </div>
  );
}

