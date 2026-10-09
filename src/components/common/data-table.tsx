"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react";

import { Pagination } from "@/components/common/pagination";
import { cn } from "@/lib/utils";

export interface DataColumn<T> {
  id: string;
  header: React.ReactNode;
  cell: (row: T, index: number) => React.ReactNode;
  /** Có giá trị này thì cột sắp xếp được (client-side). */
  sortValue?: (row: T) => string | number | boolean | null | undefined;
  width?: number;
  align?: "left" | "center" | "right";
}

interface SortState {
  columnId: string;
  order: "asc" | "desc";
}

function compare(a: unknown, b: unknown): number {
  if (a == null && b == null) return 0;
  if (a == null) return 1;
  if (b == null) return -1;
  if (typeof a === "string" && typeof b === "string") return a.localeCompare(b, "vi");
  return Number(a) - Number(b);
}

/**
 * Khung danh sách dùng chung cho các màn CRUD: thanh công cụ ở trên, bảng cuộn
 * ở giữa, phân trang ở dưới. Cùng dáng với màn Lead.
 */
export function ListPanel({
  toolbar,
  children,
  className,
}: {
  toolbar?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs", className)}>
      {toolbar}
      {children}
    </div>
  );
}

export function DataTable<T>({
  columns,
  rows,
  getRowKey,
  onRowClick,
  emptyMessage = "Không có dữ liệu.",
  unit = "mục",
  defaultSort,
  initialPageSize = 25,
  maxHeightClass = "max-h-[calc(100vh-280px)]",
}: {
  columns: DataColumn<T>[];
  rows: T[];
  getRowKey: (row: T) => string;
  onRowClick?: (row: T) => void;
  emptyMessage?: string;
  /** Đơn vị hiện ở chân bảng: "dự án", "tài khoản"… */
  unit?: string;
  defaultSort?: SortState;
  initialPageSize?: number;
  maxHeightClass?: string;
}) {
  const [sort, setSort] = React.useState<SortState | null>(defaultSort ?? null);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(initialPageSize);

  const sorted = React.useMemo(() => {
    const column = sort ? columns.find((c) => c.id === sort.columnId) : null;
    if (!sort || !column?.sortValue) return rows;
    const get = column.sortValue;
    const factor = sort.order === "asc" ? 1 : -1;
    return [...rows].sort((a, b) => factor * compare(get(a), get(b)));
  }, [rows, columns, sort]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const visible = sorted.slice((safePage - 1) * pageSize, safePage * pageSize);

  const toggleSort = (column: DataColumn<T>) => {
    if (!column.sortValue) return;
    setPage(1);
    setSort((prev) =>
      prev?.columnId === column.id
        ? { columnId: column.id, order: prev.order === "asc" ? "desc" : "asc" }
        : { columnId: column.id, order: "asc" },
    );
  };

  return (
    <>
      <div className={cn("thin-scrollbar relative overflow-auto", maxHeightClass)}>
        <table className="w-max min-w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10">
            <tr>
              {columns.map((column) => {
                const active = sort?.columnId === column.id;
                return (
                  <th
                    key={column.id}
                    style={column.width ? { width: column.width, minWidth: column.width } : undefined}
                    onClick={() => toggleSort(column)}
                    className={cn(
                      "border-b border-border bg-[#f8fafc] px-3 py-2.5 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-500",
                      column.align === "right" && "text-right",
                      column.align === "center" && "text-center",
                      column.sortValue && "cursor-pointer select-none hover:text-primary",
                    )}
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.header}
                      {column.sortValue &&
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
            {visible.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="px-3 py-14 text-center text-sm text-muted-foreground">
                  {emptyMessage}
                </td>
              </tr>
            )}
            {visible.map((row, index) => (
              <tr
                key={getRowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-border/70 transition-colors hover:bg-[#f6f9ff]",
                  onRowClick && "cursor-pointer",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.id}
                    className={cn(
                      "px-3 py-2 align-middle",
                      column.align === "right" && "text-right tabular-nums",
                      column.align === "center" && "text-center",
                    )}
                  >
                    {column.cell(row, (safePage - 1) * pageSize + index)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Pagination
        page={safePage}
        pageSize={pageSize}
        total={sorted.length}
        unit={unit}
        onPageChange={setPage}
        onPageSizeChange={(size) => {
          setPageSize(size);
          setPage(1);
        }}
      />
    </>
  );
}
