"use client";

import * as React from "react";
import {
  AlarmClock,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Copy,
  MessageSquare,
  Phone,
  RotateCcw,
} from "lucide-react";

import { AssigneeCell, CategoryCell, ContactStatusCell } from "@/components/leads/inline-cells";
import {
  buildAttrColumns,
  COLUMN_BY_ID,
  columnHeader,
  displayValue,
  LEAD_COLUMNS,
  type LeadColumn,
} from "@/components/leads/columns";
import { useNow } from "@/components/providers/now-provider";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DEFAULT_CATALOG_LABELS, FAIL_REASON_LABEL, SOURCE_LABEL } from "@/lib/constants";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import { isOverdue } from "@/lib/filters";
import type { CatalogLabels, ContactStatus, FailReason, Lead, LeadCategory } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

export interface SortState {
  columnId: string;
  order: "asc" | "desc";
}

const STAGE_ACCENT_BAR: Record<LeadCategory, string> = {
  KHD: "bg-emerald-500",
  KHQT: "bg-blue-600",
  GDTD: "bg-amber-500",
  CHUA_LH_DUOC: "bg-slate-400",
  FAIL: "bg-rose-500",
  CHUA_PHAN_LOAI: "bg-slate-300",
};

export function LeadTable({
  leads,
  page = 1,
  pageSize = 50,
  loading = false,
  visibleColumns,
  sort,
  onSortChange,
  onRowClick,
  onStatusChange,
  onCategoryChange,
  onAssigneeChange,
  canEdit,
  canAssign = false,
  assignees = [],
  attrFields,
  labels = DEFAULT_CATALOG_LABELS,
  selectedIds = [],
  onSelectedIdsChange,
  activeLeadId = null,
  hasActiveFilters = false,
  onResetFilters,
}: {
  leads: Lead[];
  page?: number;
  pageSize?: number;
  loading?: boolean;
  visibleColumns: string[];
  sort: SortState;
  onSortChange: (next: SortState) => void;
  onRowClick: (lead: Lead) => void;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => void;
  onAssigneeChange?: (lead: Lead, next: string | null) => void;
  canEdit?: (lead: Lead) => boolean;
  canAssign?: boolean;
  assignees?: readonly string[];
  /** Field phụ đang bật của project — mỗi field là một cột `attr:<key>`. */
  attrFields?: AttrFieldRow[];
  labels?: CatalogLabels;
  selectedIds?: string[];
  onSelectedIdsChange?: (ids: string[]) => void;
  /** Lead đang mở trong Drawer chi tiết để highlight dòng tương ứng trên bảng. */
  activeLeadId?: string | null;
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}) {
  const now = useNow();
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const mobileListRef = React.useRef<HTMLDivElement>(null);
  const [scrolledX, setScrolledX] = React.useState(false);

  React.useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
    mobileListRef.current?.scrollTo({ top: 0 });
  }, [page, pageSize]);

  const handleScroll = React.useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const next = e.currentTarget.scrollLeft > 8;
    setScrolledX((prev) => (prev === next ? prev : next));
  }, []);

  const attrLabels = React.useMemo(() => {
    const map: Record<string, string> = {};
    for (const f of attrFields ?? []) map[f.key] = f.label;
    return map;
  }, [attrFields]);

  const columns = React.useMemo(() => {
    const byId = new Map(COLUMN_BY_ID);
    for (const column of buildAttrColumns(attrFields ?? [])) byId.set(column.id, column);
    return visibleColumns.map((id) => byId.get(id)).filter((c): c is LeadColumn => Boolean(c));
  }, [visibleColumns, attrFields]);

  const selectedSet = React.useMemo(() => new Set(selectedIds), [selectedIds]);
  const allOnPageSelected = leads.length > 0 && leads.every((l) => selectedSet.has(l.id));
  const someOnPageSelected = !allOnPageSelected && leads.some((l) => selectedSet.has(l.id));

  const toggleAllOnPage = (checked: boolean) => {
    if (!onSelectedIdsChange) return;
    const pageIds = leads.map((l) => l.id);
    if (checked) {
      const next = new Set(selectedIds);
      for (const id of pageIds) next.add(id);
      onSelectedIdsChange([...next]);
    } else {
      const pageIdSet = new Set(pageIds);
      onSelectedIdsChange(selectedIds.filter((id) => !pageIdSet.has(id)));
    }
  };

  const toggleRow = React.useCallback(
    (leadId: string, checked: boolean) => {
      if (!onSelectedIdsChange) return;
      if (checked) {
        if (!selectedSet.has(leadId)) onSelectedIdsChange([...selectedIds, leadId]);
      } else {
        onSelectedIdsChange(selectedIds.filter((id) => id !== leadId));
      }
    },
    [onSelectedIdsChange, selectedIds, selectedSet],
  );

  const toggleSort = (column: LeadColumn) => {
    if (!column.sortable) return;
    onSortChange(
      sort.columnId === column.id
        ? { columnId: column.id, order: sort.order === "asc" ? "desc" : "asc" }
        : { columnId: column.id, order: "asc" },
    );
  };

  const selectable = Boolean(onSelectedIdsChange);
  const rowIndexOffset = Math.max(0, (page - 1) * pageSize);
  const nameStickyOffset = selectable ? 88 : 48;

  return (
    <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
      {/* Thanh tiến trình mỏng mượt phía trên khi làm mới — không đóng băng hay che mờ dữ liệu */}
      {loading && (
        <div
          role="status"
          aria-live="polite"
          className="pointer-events-none absolute inset-x-0 top-0 z-30 h-0.5 overflow-hidden bg-primary/15"
        >
          <div className="h-full w-1/2 animate-pulse bg-primary" />
          <span className="sr-only">Đang tải danh sách lead...</span>
        </div>
      )}

      {/* ===================================================================== */}
      {/* MOBILE STACKED LEAD CARDS (< 768px) — Trải nghiệm chuẩn Native CRM App */}
      {/* ===================================================================== */}
      <div
        ref={mobileListRef}
        className={cn(
          "min-h-0 flex-1 space-y-2.5 overflow-y-auto overscroll-contain bg-background/50 p-2.5 md:hidden",
          loading && leads.length > 0 && "opacity-75 transition-opacity",
        )}
      >
        {loading && leads.length === 0 && (
          <div className="space-y-2.5">
            {Array.from({ length: 5 }).map((_, idx) => (
              <div
                key={idx}
                className="h-32 animate-pulse rounded-xl border border-border bg-card p-3.5 shadow-2xs"
              >
                <div className="flex items-center justify-between">
                  <div className="h-4 w-36 rounded bg-slate-200" />
                  <div className="h-5 w-20 rounded-full bg-slate-100" />
                </div>
                <div className="mt-3 h-3.5 w-48 rounded bg-slate-100" />
                <div className="mt-5 flex justify-between">
                  <div className="h-7 w-24 rounded-full bg-slate-100" />
                  <div className="flex gap-2">
                    <div className="h-8 w-16 rounded-lg bg-slate-100" />
                    <div className="h-8 w-16 rounded-lg bg-slate-100" />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}

        {!loading && leads.length === 0 && (
          <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border bg-card px-4 py-14 text-center">
            <span className="text-sm text-muted-foreground">Không có lead nào khớp bộ lọc hiện tại.</span>
            {hasActiveFilters && onResetFilters && (
              <Button variant="outline" size="sm" onClick={onResetFilters} className="gap-1.5">
                <RotateCcw className="size-3.5" />
                Xóa bộ lọc
              </Button>
            )}
          </div>
        )}

        {leads.map((lead, idx) => {
          const isSelected = selectedSet.has(lead.id);
          const isActive = activeLeadId === lead.id;
          const overdue = isOverdue(lead, now);
          const editable = !canEdit || canEdit(lead);
          return (
            <MobileLeadCard
              key={lead.id}
              lead={lead}
              rowNumber={rowIndexOffset + idx + 1}
              selectable={selectable}
              isSelected={isSelected}
              isActive={isActive}
              overdue={overdue}
              editable={editable}
              canAssign={Boolean(canAssign && onAssigneeChange)}
              assignees={assignees}
              onSelectRow={toggleRow}
              onCardClick={onRowClick}
              onStatusChange={onStatusChange}
              onCategoryChange={onCategoryChange}
              onAssigneeChange={onAssigneeChange}
            />
          );
        })}
      </div>

      {/* ===================================================================== */}
      {/* DESKTOP & TABLET HIGH-VELOCITY DATA TABLE (>= 768px)                  */}
      {/* ===================================================================== */}
      <div
        ref={scrollRef}
        onScroll={handleScroll}
        className={cn(
          "thin-scrollbar relative hidden min-h-0 flex-1 overflow-auto md:block",
          loading && leads.length > 0 && "opacity-75 transition-opacity",
        )}
      >
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-20">
            <tr>
              {selectable && (
                <th
                  style={{ width: 40, minWidth: 40 }}
                  className="sticky left-0 z-30 border-b border-border bg-[#f8fafc] px-3 py-2.5 text-center"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Checkbox
                    aria-label="Chọn tất cả trên trang"
                    checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                    onCheckedChange={(c) => toggleAllOnPage(Boolean(c))}
                  />
                </th>
              )}
              <th
                style={{ width: 48, minWidth: 48, left: selectable ? 40 : 0 }}
                className={cn(
                  "sticky z-30 border-b border-border bg-[#f8fafc] px-2.5 py-2.5 text-center text-[11px] font-semibold uppercase tracking-wide text-slate-500",
                  scrolledX && "max-lg:shadow-[2px_0_5px_-2px_rgba(15,23,42,0.08)]",
                )}
              >
                #
              </th>
              {columns.map((column) => {
                const active = sort.columnId === column.id;
                const headerText = columnHeader(column.id, labels, attrLabels);
                const isNameCol = column.id === "name";
                return (
                  <th
                    key={column.id}
                    style={{
                      width: column.width,
                      minWidth: column.width,
                      ...(isNameCol ? { "--sticky-name-left": `${nameStickyOffset}px` } as React.CSSProperties : {}),
                    }}
                    className={cn(
                      "border-b border-border bg-[#f8fafc] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500",
                      isNameCol && "lg:sticky lg:left-[var(--sticky-name-left)] lg:z-30",
                      isNameCol && scrolledX && "lg:shadow-[3px_0_6px_-2px_rgba(15,23,42,0.09)]",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.sortable && "cursor-pointer select-none hover:text-primary",
                    )}
                    onClick={() => toggleSort(column)}
                  >
                    <span className="inline-flex items-center gap-1">
                      {headerText}
                      {column.sortable &&
                        (active ? (
                          sort.order === "asc" ? (
                            <ArrowUp className="size-3 text-primary" />
                          ) : (
                            <ArrowDown className="size-3 text-primary" />
                          )
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-40" />
                        ))}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {!loading && leads.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + (selectable ? 2 : 1)}
                  className="px-3 py-16 text-center text-sm text-muted-foreground"
                >
                  <div className="flex flex-col items-center justify-center gap-2.5">
                    <span>Không có lead nào khớp bộ lọc hiện tại.</span>
                    {hasActiveFilters && onResetFilters && (
                      <Button variant="outline" size="sm" onClick={onResetFilters} className="gap-1.5">
                        <RotateCcw className="size-3.5" />
                        Xóa lọc
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            )}

            {leads.map((lead, idx) => {
              const isSelected = selectedSet.has(lead.id);
              const isActive = activeLeadId === lead.id;
              const overdue = isOverdue(lead, now);
              const editable = !canEdit || canEdit(lead);
              return (
                <DesktopLeadRow
                  key={lead.id}
                  lead={lead}
                  rowNumber={rowIndexOffset + idx + 1}
                  columns={columns}
                  selectable={selectable}
                  isSelected={isSelected}
                  isActive={isActive}
                  overdue={overdue}
                  scrolledX={scrolledX}
                  nameStickyOffset={nameStickyOffset}
                  editable={editable}
                  canAssign={Boolean(canAssign && onAssigneeChange)}
                  assignees={assignees}
                  attrFields={attrFields}
                  onSelectRow={toggleRow}
                  onRowClick={onRowClick}
                  onStatusChange={onStatusChange}
                  onCategoryChange={onCategoryChange}
                  onAssigneeChange={onAssigneeChange}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

const MobileLeadCard = React.memo(function MobileLeadCard({
  lead,
  rowNumber,
  selectable,
  isSelected,
  isActive,
  overdue,
  editable,
  canAssign,
  assignees,
  onSelectRow,
  onCardClick,
  onStatusChange,
  onCategoryChange,
  onAssigneeChange,
}: {
  lead: Lead;
  rowNumber: number;
  selectable: boolean;
  isSelected: boolean;
  isActive: boolean;
  overdue: boolean;
  editable: boolean;
  canAssign: boolean;
  assignees: readonly string[];
  onSelectRow: (id: string, checked: boolean) => void;
  onCardClick: (lead: Lead) => void;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => void;
  onAssigneeChange?: (lead: Lead, next: string | null) => void;
}) {
  const toast = useToast();
  const accentColor = STAGE_ACCENT_BAR[lead.category] ?? STAGE_ACCENT_BAR.CHUA_PHAN_LOAI;
  const metaParts = [lead.brand, lead.product, lead.location && lead.location !== "Chưa phân bổ" ? lead.location : null]
    .filter(Boolean)
    .join(" · ");

  const copyPhone = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!lead.phone) return;
    try {
      await navigator.clipboard.writeText(lead.phone);
      toast.info("Đã sao chép SĐT", lead.phone);
    } catch {
      toast.warning("Không sao chép được", "Trình duyệt đang chặn clipboard.");
    }
  };

  return (
    <article
      onClick={() => onCardClick(lead)}
      className={cn(
        "relative overflow-hidden rounded-xl border border-border bg-card pl-4 pr-3.5 py-3 shadow-2xs transition-[background-color,border-color,transform] active:scale-[0.992]",
        overdue && "border-amber-300/80 bg-amber-50/30",
        isSelected && "border-primary/50 bg-blue-50/50",
        isActive && "ring-2 ring-primary/35",
      )}
    >
      {/* Thanh vạch màu 3.5px nhận diện nhanh giai đoạn / phân loại khách */}
      <span aria-hidden className={cn("absolute inset-y-0 left-0 w-1", accentColor)} />

      {/* Hàng 1: Checkbox + Tên khách + Phân loại nhanh */}
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 flex-1 items-center gap-2.5">
          {selectable && (
            <div
              className="-m-1.5 flex size-8 shrink-0 items-center justify-center"
              onClick={(e) => e.stopPropagation()}
            >
              <Checkbox
                aria-label={`Chọn lead ${lead.name ?? lead.phone}`}
                checked={isSelected}
                onCheckedChange={(c) => onSelectRow(lead.id, Boolean(c))}
              />
            </div>
          )}
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-medium tabular-nums text-slate-400">#{rowNumber}</span>
              <h3 className="truncate text-[15px] font-bold leading-snug text-slate-900">
                {lead.name || "Khách chưa có tên"}
              </h3>
            </div>
          </div>
        </div>

        <div className="shrink-0" onClick={(e) => e.stopPropagation()}>
          <CategoryCell
            value={lead.category}
            editable={editable}
            onChange={(next, failReason) => onCategoryChange(lead, next, failReason)}
          />
        </div>
      </div>

      {/* Hàng 2: SĐT, Nguồn, Thời gian & Sản phẩm quan tâm */}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-xs text-slate-600">
        {lead.phone ? (
          <span className="font-semibold tabular-nums text-slate-800">{lead.phone}</span>
        ) : (
          <span className="italic text-slate-400">Chưa có SĐT</span>
        )}
        <span className="text-slate-300">•</span>
        <span>{SOURCE_LABEL[lead.source]}</span>
        <span className="text-slate-300">•</span>
        <span className="tabular-nums text-muted-foreground">{formatDateTime(lead.createdAt)}</span>
      </div>

      {(metaParts || lead.failReason || overdue || lead.careNote) && (
        <div className="mt-2 space-y-1.5">
          {(metaParts || lead.failReason || overdue) && (
            <div className="flex flex-wrap items-center gap-1.5 text-[11.5px]">
              {metaParts && (
                <span className="truncate rounded-md bg-slate-100 px-2 py-0.5 font-medium text-slate-700">
                  {metaParts}
                </span>
              )}
              {lead.category === "FAIL" && lead.failReason && (
                <span className="rounded-md bg-rose-50 px-2 py-0.5 font-medium text-rose-700">
                  {FAIL_REASON_LABEL[lead.failReason]}
                </span>
              )}
              {overdue && lead.callbackAt && (
                <span className="inline-flex items-center gap-1 rounded-md bg-amber-100/80 px-2 py-0.5 font-semibold tabular-nums text-amber-800">
                  <AlarmClock className="size-3" />
                  Hẹn: {formatDateTime(lead.callbackAt)}
                </span>
              )}
            </div>
          )}

          {lead.careNote && (
            <p className="line-clamp-1 rounded-lg bg-slate-50 px-2.5 py-1 text-xs text-slate-600">
              {lead.careNote}
            </p>
          )}
        </div>
      )}

      {/* Hàng 3: Thanh thao tác 1 chạm cho ngón cái (Trạng thái, Phụ trách, Gọi, Zalo) */}
      <div
        className="mt-2.5 flex items-center justify-between gap-2 border-t border-border/60 pt-2.5"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex min-w-0 flex-wrap items-center gap-1.5">
          <ContactStatusCell
            value={lead.contactStatus}
            editable={editable}
            onChange={(next) => onStatusChange(lead, next)}
          />
          <AssigneeCell
            value={lead.assignee}
            assignees={assignees}
            editable={canAssign}
            onChange={(next) => onAssigneeChange?.(lead, next)}
          />
        </div>

        {lead.phone && (
          <div className="flex shrink-0 items-center gap-1.5">
            <button
              type="button"
              onClick={copyPhone}
              aria-label="Sao chép số điện thoại"
              className="flex size-8.5 items-center justify-center rounded-lg border border-border bg-slate-50 text-slate-600 active:bg-slate-200"
            >
              <Copy className="size-3.5" />
            </button>
            <a
              href={`https://zalo.me/${lead.phone}`}
              target="_blank"
              rel="noreferrer"
              aria-label="Nhắn Zalo"
              className="inline-flex h-8.5 items-center gap-1 rounded-lg border border-blue-200 bg-blue-50 px-2.5 text-xs font-semibold text-blue-700 active:bg-blue-100"
            >
              <MessageSquare className="size-3.5" />
              <span>Zalo</span>
            </a>
            <a
              href={`tel:${lead.phone}`}
              aria-label="Gọi điện"
              className="inline-flex h-8.5 items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 text-xs font-semibold text-emerald-700 active:bg-emerald-100"
            >
              <Phone className="size-3.5" />
              <span>Gọi</span>
            </a>
          </div>
        )}
      </div>
    </article>
  );
});

const DesktopLeadRow = React.memo(function DesktopLeadRow({
  lead,
  rowNumber,
  columns,
  selectable,
  isSelected,
  isActive,
  overdue,
  scrolledX,
  nameStickyOffset,
  editable,
  canAssign,
  assignees,
  attrFields,
  onSelectRow,
  onRowClick,
  onStatusChange,
  onCategoryChange,
  onAssigneeChange,
}: {
  lead: Lead;
  rowNumber: number;
  columns: LeadColumn[];
  selectable: boolean;
  isSelected: boolean;
  isActive: boolean;
  overdue: boolean;
  scrolledX: boolean;
  nameStickyOffset: number;
  editable: boolean;
  canAssign: boolean;
  assignees: readonly string[];
  attrFields?: AttrFieldRow[];
  onSelectRow: (id: string, checked: boolean) => void;
  onRowClick: (lead: Lead) => void;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => void;
  onAssigneeChange?: (lead: Lead, next: string | null) => void;
}) {
  const stickyCellBg = isActive
    ? "bg-[#edf3ff]"
    : isSelected
      ? "bg-[#f1f6ff]"
      : overdue
        ? "bg-[#fffbeb]"
        : "bg-card group-hover/row:bg-[#f6f9ff]";

  return (
    <tr
      onClick={() => onRowClick(lead)}
      className={cn(
        "group/row cursor-pointer border-b border-border/70 transition-colors hover:bg-[#f6f9ff]",
        overdue && "bg-amber-50/45",
        isSelected && "bg-blue-50/65",
        isActive && "bg-primary/[0.08] ring-1 ring-inset ring-primary/25",
      )}
    >
      {selectable && (
        <td
          style={{ width: 40, minWidth: 40 }}
          className={cn("sticky left-0 z-10 px-3 py-2 text-center align-middle transition-colors", stickyCellBg)}
          onClick={(e) => e.stopPropagation()}
        >
          <Checkbox
            aria-label={`Chọn lead ${lead.name ?? lead.phone}`}
            checked={isSelected}
            onCheckedChange={(c) => onSelectRow(lead.id, Boolean(c))}
          />
        </td>
      )}
      <td
        style={{ width: 48, minWidth: 48, left: selectable ? 40 : 0 }}
        className={cn(
          "sticky z-10 px-2.5 py-2 text-center align-middle text-xs tabular-nums text-slate-400 transition-colors",
          stickyCellBg,
          scrolledX && "max-lg:shadow-[2px_0_5px_-2px_rgba(15,23,42,0.06)]",
        )}
      >
        {rowNumber}
      </td>
      {columns.map((column) => {
        const isNameCol = column.id === "name";
        return (
          <td
            key={column.id}
            style={{
              width: column.width,
              minWidth: column.width,
              ...(isNameCol ? ({ "--sticky-name-left": `${nameStickyOffset}px` } as React.CSSProperties) : {}),
            }}
            className={cn(
              "px-3 py-2 align-middle",
              isNameCol && cn("lg:sticky lg:left-[var(--sticky-name-left)] lg:z-10 lg:transition-colors", stickyCellBg),
              isNameCol && scrolledX && "lg:shadow-[3px_0_6px_-2px_rgba(15,23,42,0.07)]",
              column.align === "right" && "text-right tabular-nums",
              column.align === "center" && "text-center",
            )}
          >
            <Cell
              lead={lead}
              column={column}
              attrFields={attrFields}
              editable={editable}
              canAssign={canAssign}
              assignees={assignees}
              overdue={overdue}
              onStatusChange={onStatusChange}
              onCategoryChange={onCategoryChange}
              onAssigneeChange={onAssigneeChange}
            />
          </td>
        );
      })}
    </tr>
  );
});

function Cell({
  lead,
  column,
  attrFields,
  editable,
  canAssign,
  assignees,
  overdue,
  onStatusChange,
  onCategoryChange,
  onAssigneeChange,
}: {
  lead: Lead;
  column: LeadColumn;
  attrFields?: AttrFieldRow[];
  editable: boolean;
  canAssign: boolean;
  assignees: readonly string[];
  overdue: boolean;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => void;
  onAssigneeChange?: (lead: Lead, next: string | null) => void;
}) {
  switch (column.id) {
    case "contactStatus":
      return (
        <ContactStatusCell
          value={lead.contactStatus}
          editable={editable}
          onChange={(next) => onStatusChange(lead, next)}
        />
      );
    case "category":
      return (
        <CategoryCell
          value={lead.category}
          editable={editable}
          onChange={(next, failReason) => onCategoryChange(lead, next, failReason)}
        />
      );
    case "assignee":
      return (
        <AssigneeCell
          value={lead.assignee}
          assignees={assignees}
          editable={canAssign}
          onChange={(next) => onAssigneeChange?.(lead, next)}
        />
      );
    case "phone":
      return <PhoneCell phone={lead.phone} />;
    case "name":
      return lead.name ? (
        <span className="block truncate font-semibold text-slate-900" title={lead.name}>
          {lead.name}
        </span>
      ) : (
        <Dash />
      );
    case "failReason":
      return lead.failReason ? (
        <span className="text-rose-600">{displayValue(lead, column.id)}</span>
      ) : (
        <Dash />
      );
    case "createdAt":
      return <span className="whitespace-nowrap tabular-nums text-slate-600">{displayValue(lead, column.id)}</span>;
    case "callbackAt":
      if (!lead.callbackAt) return <Dash />;
      return (
        <span
          className={cn(
            "whitespace-nowrap tabular-nums",
            overdue ? "font-semibold text-amber-700" : "text-slate-600",
          )}
        >
          {displayValue(lead, column.id)}
        </span>
      );
    default: {
      const text = displayValue(lead, column.id, attrFields);
      if (!text) return <Dash />;
      return (
        <span className="block truncate text-slate-700" title={text}>
          {text}
        </span>
      );
    }
  }
}

function Dash() {
  return <span className="text-slate-300">—</span>;
}

function PhoneCell({ phone }: { phone: string }) {
  const toast = useToast();
  const [copied, setCopied] = React.useState(false);

  if (!phone) return <Dash />;

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
      toast.info("Đã sao chép số điện thoại", phone);
    } catch {
      toast.warning("Không sao chép được", "Trình duyệt đang chặn clipboard.");
    }
  };

  return (
    <span className="inline-flex items-center gap-0.5">
      <span className="mr-1 font-medium tabular-nums text-slate-800">{phone}</span>
      <a
        href={`tel:${phone}`}
        onClick={(e) => e.stopPropagation()}
        title="Gọi điện"
        aria-label={`Gọi ${phone}`}
        className="inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-emerald-50 hover:text-emerald-600"
      >
        <Phone className="size-3.5" />
      </a>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Đã sao chép" : "Sao chép số"}
        aria-label="Sao chép số điện thoại"
        className="inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-primary/10 hover:text-primary"
      >
        <Copy className="size-3.5" />
      </button>
      <a
        href={`https://zalo.me/${phone}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Nhắn Zalo"
        aria-label={`Nhắn Zalo ${phone}`}
        className="inline-flex size-6 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-blue-50 hover:text-blue-600"
      >
        <MessageSquare className="size-3.5" />
      </a>
    </span>
  );
}

export const ALL_COLUMN_TOGGLES = LEAD_COLUMNS.map((c) => ({ id: c.id, header: c.header }));
