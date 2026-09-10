"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Copy, MessageSquare } from "lucide-react";

import { CategoryCell, ContactStatusCell } from "@/components/leads/inline-cells";
import { COLUMN_BY_ID, displayValue, LEAD_COLUMNS, type LeadColumn } from "@/components/leads/columns";
import { useNow } from "@/components/providers/now-provider";
import { isOverdue } from "@/lib/filters";
import type { ContactStatus, Lead, LeadCategory } from "@/lib/types";
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
}: {
  leads: Lead[];
  visibleColumns: string[];
  sort: SortState;
  onSortChange: (next: SortState) => void;
  onRowClick: (lead: Lead) => void;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory) => void;
}) {
  const now = useNow();
  const columns = React.useMemo(
    () => visibleColumns.map((id) => COLUMN_BY_ID.get(id)).filter((c): c is LeadColumn => Boolean(c)),
    [visibleColumns],
  );

  const toggleSort = (column: LeadColumn) => {
    if (!column.sortable) return;
    onSortChange(
      sort.columnId === column.id
        ? { columnId: column.id, order: sort.order === "asc" ? "desc" : "asc" }
        : { columnId: column.id, order: "asc" },
    );
  };

  return (
    <div className="thin-scrollbar relative flex-1 overflow-auto">
      <table className="w-max min-w-full border-collapse text-[13px]">
        <thead className="sticky top-0 z-20">
          <tr>
            {columns.map((column) => {
              const active = sort.columnId === column.id;
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
                    {column.header}
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
              <td colSpan={columns.length} className="px-3 py-16 text-center text-sm text-muted-foreground">
                Không có lead nào khớp bộ lọc hiện tại.
              </td>
            </tr>
          )}

          {leads.map((lead) => (
            <tr
              key={lead.id}
              onClick={() => onRowClick(lead)}
              className={cn(
                "cursor-pointer border-b border-border/70 transition-colors hover:bg-[#f6f9ff]",
                isOverdue(lead, now) && "bg-amber-50/40",
              )}
            >
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
                  <Cell lead={lead} column={column} onStatusChange={onStatusChange} onCategoryChange={onCategoryChange} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Cell({
  lead,
  column,
  onStatusChange,
  onCategoryChange,
}: {
  lead: Lead;
  column: LeadColumn;
  onStatusChange: (lead: Lead, next: ContactStatus) => void;
  onCategoryChange: (lead: Lead, next: LeadCategory) => void;
}) {
  const now = useNow();

  switch (column.id) {
    case "contactStatus":
      return <ContactStatusCell value={lead.contactStatus} onChange={(next) => onStatusChange(lead, next)} />;
    case "category":
      return <CategoryCell value={lead.category} onChange={(next) => onCategoryChange(lead, next)} />;
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
    case "pushedToB10":
      return lead.pushedToB10 ? (
        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[11px] font-medium text-emerald-700">Đã lên</span>
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
      const text = displayValue(lead, column.id);
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
  const [copied, setCopied] = React.useState(false);

  const copy = async (e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(phone);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch {
      /* clipboard bị chặn — bỏ qua */
    }
  };

  return (
    <span className="inline-flex items-center gap-1.5">
      <span className="tabular-nums text-slate-700">{phone}</span>
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
