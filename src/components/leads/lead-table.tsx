"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, MessageSquare, Phone, RotateCcw } from "lucide-react";

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
import { DEFAULT_CATALOG_LABELS } from "@/lib/constants";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import { isOverdue } from "@/lib/filters";
import type { CatalogLabels, ContactStatus, FailReason, Lead, LeadCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface SortState {
  columnId: string;
  order: "asc" | "desc";
}

export function LeadTable({
  leads,
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
  hasActiveFilters = false,
  onResetFilters,
}: {
  leads: Lead[];
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
  hasActiveFilters?: boolean;
  onResetFilters?: () => void;
}) {
  const now = useNow();
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

  const toggleRow = (leadId: string, checked: boolean) => {
    if (!onSelectedIdsChange) return;
    if (checked) {
      if (!selectedSet.has(leadId)) onSelectedIdsChange([...selectedIds, leadId]);
    } else {
      onSelectedIdsChange(selectedIds.filter((id) => id !== leadId));
    }
  };

  const toggleSort = (column: LeadColumn) => {
    if (!column.sortable) return;
    onSortChange(
      sort.columnId === column.id
        ? { columnId: column.id, order: sort.order === "asc" ? "desc" : "asc" }
        : { columnId: column.id, order: "asc" },
    );
  };

  const selectable = Boolean(onSelectedIdsChange);

  return (
    <div className="thin-scrollbar relative flex-1 overflow-auto">
      <table className="w-max min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-20">
          <tr>
            {selectable && (
              <th
                style={{ width: 40, minWidth: 40 }}
                className="border-b border-border bg-[#f8fafc] px-3 py-2.5 text-center"
                onClick={(e) => e.stopPropagation()}
              >
                <Checkbox
                  aria-label="Chọn tất cả trên trang"
                  checked={allOnPageSelected ? true : someOnPageSelected ? "indeterminate" : false}
                  onCheckedChange={(c) => toggleAllOnPage(Boolean(c))}
                />
              </th>
            )}
            {columns.map((column) => {
              const active = sort.columnId === column.id;
              const headerText = columnHeader(column.id, labels, attrLabels);
              return (
                <th
                  key={column.id}
                  style={{ width: column.width, minWidth: column.width }}
                  className={cn(
                    "border-b border-border bg-[#f8fafc] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500",
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
                          <ArrowUp className="size-3" />
                        ) : (
                          <ArrowDown className="size-3" />
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
          {leads.length === 0 && (
            <tr>
              <td
                colSpan={columns.length + (selectable ? 1 : 0)}
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

          {leads.map((lead) => {
            const isSelected = selectedSet.has(lead.id);
            return (
              <tr
                key={lead.id}
                onClick={() => onRowClick(lead)}
                className={cn(
                  "cursor-pointer border-b border-border/70 transition-colors hover:bg-[#f6f9ff]",
                  isOverdue(lead, now) && "bg-amber-50/40",
                  isSelected && "bg-blue-50/60",
                )}
              >
                {selectable && (
                  <td
                    style={{ width: 40, minWidth: 40 }}
                    className="px-3 py-2 text-center align-middle"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Checkbox
                      aria-label={`Chọn lead ${lead.name ?? lead.phone}`}
                      checked={isSelected}
                      onCheckedChange={(c) => toggleRow(lead.id, Boolean(c))}
                    />
                  </td>
                )}
                {columns.map((column) => (
                  <td
                    key={column.id}
                    style={{ width: column.width, minWidth: column.width }}
                    className={cn(
                      "px-3 py-2 align-middle",
                      column.align === "right" && "text-right tabular-nums",
                      column.align === "center" && "text-center",
                    )}
                  >
                    <Cell
                      lead={lead}
                      column={column}
                      attrFields={attrFields}
                      editable={!canEdit || canEdit(lead)}
                      canAssign={canAssign}
                      assignees={assignees}
                      onStatusChange={onStatusChange}
                      onCategoryChange={onCategoryChange}
                      onAssigneeChange={onAssigneeChange}
                    />
                  </td>
                ))}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  lead,
  column,
  attrFields,
  editable,
  canAssign,
  assignees,
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
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory, failReason?: FailReason | null) => void;
  onAssigneeChange?: (lead: Lead, next: string | null) => void;
}) {
  const now = useNow();

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
          editable={Boolean(canAssign && onAssigneeChange)}
          onChange={(next) => onAssigneeChange?.(lead, next)}
        />
      );
    case "phone":
      return <PhoneCell phone={lead.phone} />;
    case "name":
      return lead.name ? <span className="font-semibold text-slate-800">{lead.name}</span> : <Dash />;
    case "failReason":
      return lead.failReason ? (
        <span className="text-rose-600">{displayValue(lead, column.id)}</span>
      ) : (
        <Dash />
      );
    case "createdAt":
      return <span className="whitespace-nowrap text-slate-600">{displayValue(lead, column.id)}</span>;
    case "callbackAt":
      if (!lead.callbackAt) return <Dash />;
      return (
        <span className={cn("whitespace-nowrap", isOverdue(lead, now) ? "font-medium text-amber-700" : "text-slate-600")}>
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
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums text-slate-700">{phone}</span>
      <a
        href={`tel:${phone}`}
        onClick={(e) => e.stopPropagation()}
        title="Gọi điện"
        className="text-slate-400 transition-colors hover:text-emerald-600"
      >
        <Phone className="size-3" />
      </a>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Đã sao chép" : "Sao chép số"}
        className="text-slate-400 transition-colors hover:text-primary"
      >
        <Copy className="size-3" />
      </button>
      <a
        href={`https://zalo.me/${phone}`}
        target="_blank"
        rel="noreferrer"
        onClick={(e) => e.stopPropagation()}
        title="Nhắn Zalo"
        className="text-slate-400 transition-colors hover:text-primary"
      >
        <MessageSquare className="size-3" />
      </a>
    </span>
  );
}

export const ALL_COLUMN_TOGGLES = LEAD_COLUMNS.map((c) => ({ id: c.id, header: c.header }));

