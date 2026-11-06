"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronDown, ChevronRight, ChevronsUpDown, Download, Loader2 } from "lucide-react";

import { ColumnVisibilityPopover } from "@/components/common/column-visibility";
import { Pagination } from "@/components/common/pagination";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DEFAULT_CATALOG_LABELS } from "@/lib/constants";
import { pivotDimensionLabels, type PivotDimension, type PivotResult, type PivotRow } from "@/lib/metrics";
import type { CatalogLabels } from "@/lib/types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface MetricColumn {
  id: keyof PivotRow;
  header: string;
  hint?: string;
  kind: "count" | "percent";
  tone?: "danger" | "warning" | "success" | "muted";
}

const METRIC_COLUMNS: MetricColumn[] = [
  { id: "leads", header: "Lead", hint: "Tổng số lead thu về", kind: "count" },
  { id: "leadShare", header: "Tỷ trọng", hint: "% so với tổng lead toàn bảng (hoặc hàng cha)", kind: "percent", tone: "muted" },
  { id: "uncontacted", header: "Chưa LH", hint: "Số lead chưa liên hệ", kind: "count", tone: "warning" },
  { id: "contacted", header: "Đã LH", hint: "Số lead đã liên hệ", kind: "count" },
  { id: "contactRate", header: "Tỷ lệ LH", hint: "Đã liên hệ / Tổng lead", kind: "percent", tone: "muted" },
  { id: "unreachable", header: "Chưa LH được", hint: "Khách không nghe máy / thuê bao", kind: "count", tone: "muted" },
  { id: "khqt", header: "KHQT+", hint: "Khách quan tâm trở lên (gồm KHQT, GDTD, KHĐ)", kind: "count", tone: "success" },
  { id: "khqtRate", header: "Tỷ lệ KHQT+", hint: "KHQT+ / Tổng lead", kind: "percent", tone: "success" },
  { id: "gdtd", header: "GDTD+", hint: "Giao dịch theo dõi trở lên (gồm GDTD, KHĐ)", kind: "count" },
  { id: "khd", header: "KHĐ", hint: "Số khách ký hợp đồng", kind: "count", tone: "success" },
  { id: "signRate", header: "Tỷ lệ ký HĐ", hint: "KHĐ / Tổng lead", kind: "percent", tone: "muted" },
  { id: "failed", header: "Loại", hint: "Số lead bị đánh dấu Fail", kind: "count", tone: "danger" },
  { id: "failRate", header: "Tỷ lệ loại", hint: "Loại / Tổng lead", kind: "percent", tone: "danger" },
  { id: "overdue", header: "Quá hạn", hint: "Quá hạn lịch hẹn gọi lại", kind: "count", tone: "danger" },
];

const DEFAULT_METRICS = METRIC_COLUMNS.map((c) => c.id as string);

function cellText(row: PivotRow, column: MetricColumn) {
  const value = row[column.id] as number;
  return column.kind === "percent" ? formatPercent(value) : formatNumber(value);
}

/**
 * Chiều phân tích do trang cha giữ vì pivot được tính ở server — đổi chiều là
 * một truy vấn mới chứ không phải tính lại trong trình duyệt.
 */
export function PivotTab({
  pivot,
  pivotByDimension,
  groupBy,
  splitBy,
  onGroupByChange,
  onSplitByChange,
  labels = DEFAULT_CATALOG_LABELS,
}: {
  pivot: PivotResult;
  pivotByDimension: Record<string, PivotResult>;
  groupBy: PivotDimension;
  splitBy: PivotDimension | "NONE";
  onGroupByChange: (dim: PivotDimension) => void;
  onSplitByChange: (dim: PivotDimension | "NONE") => void;
  /** Nhãn brand / sản phẩm / location theo project. */
  labels?: CatalogLabels;
}) {
  const toast = useToast();
  const PIVOT_DIMENSIONS = React.useMemo(() => pivotDimensionLabels(labels), [labels]);
  const [metrics, setMetrics] = React.useState<string[]>(DEFAULT_METRICS);
  const [sortBy, setSortBy] = React.useState<keyof PivotRow>("leads");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = React.useState(false);
  const [collapsedKeys, setCollapsedKeys] = React.useState<string[]>([]);
  const [page, setPage] = React.useState(1);
  const [pageSize, setPageSize] = React.useState(25);
  const [prevPivotRows, setPrevPivotRows] = React.useState(pivot.rows);
  if (prevPivotRows !== pivot.rows) {
    setPrevPivotRows(pivot.rows);
    setPage(1);
  }

  const visibleMetrics = METRIC_COLUMNS.filter((c) => metrics.includes(c.id as string));

  const rows = React.useMemo(() => {
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...pivot.rows].sort((a, b) => {
      if (sortBy === "key") return a.key.localeCompare(b.key, "vi") * dir;
      return ((a[sortBy] as number) - (b[sortBy] as number)) * dir;
    });
  }, [pivot.rows, sortBy, sortOrder]);

  const pageCount = Math.max(1, Math.ceil(rows.length / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const pagedRows = rows.slice((safePage - 1) * pageSize, safePage * pageSize);

  const maxLeads = Math.max(...pivot.rows.map((r) => r.leads), 1);

  const toggleSort = (id: keyof PivotRow) => {
    setPage(1);
    if (sortBy === id) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(id);
      setSortOrder("desc");
    }
  };

  const toggleRowCollapse = (key: string) => {
    setCollapsedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const allCollapsed = rows.length > 0 && collapsedKeys.length >= rows.length;

  const handleExport = async () => {
    setExporting(true);
    try {
      const formatRowValues = (row: PivotRow, keyLabel: string) => ({
        key: keyLabel,
        ...Object.fromEntries(
          visibleMetrics.map((c) => [
            c.id as string,
            c.kind === "percent" ? Number((row[c.id] as number).toFixed(1)) : (row[c.id] as number),
          ]),
        ),
      });

      const buildSheet = (dim: PivotDimension, result: PivotResult, includeSplit: boolean) => {
        const exportRows: Record<string, string | number>[] = [];
        for (const row of result.rows) {
          exportRows.push(formatRowValues(row, row.key));
          if (includeSplit && splitBy !== "NONE" && result.splitKeys.length > 0) {
            for (const sKey of result.splitKeys) {
              const child = result.split[row.key]?.[sKey];
              if (child) {
                exportRows.push(formatRowValues(child, `  ↳ ${sKey}`));
              }
            }
          }
        }
        exportRows.push(formatRowValues(result.total, result.total.key));

        const headerTitle =
          includeSplit && splitBy !== "NONE"
            ? `${PIVOT_DIMENSIONS[dim]} / ${PIVOT_DIMENSIONS[splitBy]}`
            : PIVOT_DIMENSIONS[dim];

        return {
          name: PIVOT_DIMENSIONS[dim],
          columns: [
            { key: "key", header: headerTitle, width: 30 },
            ...visibleMetrics.map((c) => ({ key: c.id as string, header: c.header, width: 14 })),
          ],
          rows: exportRows,
        };
      };

      const extraDims = (Object.keys(pivotByDimension) as PivotDimension[]).filter((d) => d !== groupBy);
      const sheets = [
        buildSheet(groupBy, pivot, true),
        ...extraDims.map((dim) => buildSheet(dim, pivotByDimension[dim], false)),
      ];

      const response = await fetch("/api/export/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `bao-cao-${groupBy}`, sheets }),
      });
      if (!response.ok) {
        toast.error("Xuất báo cáo thất bại");
        return;
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bao-cao-chi-tiet.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error("Xuất báo cáo thất bại");
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3.5 shadow-xs sm:flex-row sm:flex-wrap sm:items-end sm:px-4 sm:py-3">
        <div className="grid grid-cols-2 gap-2.5 sm:flex sm:items-end sm:gap-3">
          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nhóm theo</Label>
            <Select
              value={groupBy}
              onValueChange={(v) => {
                setCollapsedKeys([]);
                setPage(1);
                onGroupByChange(v as PivotDimension);
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {Object.entries(PIVOT_DIMENSIONS).map(([key, label]) => (
                  <SelectItem key={key} value={key}>
                    {label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Chi tiết 2 chiều
            </Label>
            <Select
              value={splitBy}
              onValueChange={(v) => {
                setCollapsedKeys([]);
                setPage(1);
                onSplitByChange(v as PivotDimension | "NONE");
              }}
            >
              <SelectTrigger size="sm" className="w-full sm:w-44">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="NONE">Không tách</SelectItem>
                {Object.entries(PIVOT_DIMENSIONS)
                  .filter(([key]) => key !== groupBy)
                  .map(([key, label]) => (
                    <SelectItem key={key} value={key}>
                      {label}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Bộ chọn sắp xếp hiển thị trên Mobile (thay cho bấm cột bảng) */}
        <div className="space-y-1 md:hidden">
          <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Sắp xếp theo</Label>
          <Select
            value={String(sortBy)}
            onValueChange={(v) => {
              setPage(1);
              setSortBy(v as keyof PivotRow);
              setSortOrder(v === "key" ? "asc" : "desc");
            }}
          >
            <SelectTrigger size="sm" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="key">{PIVOT_DIMENSIONS[groupBy]} (A → Z)</SelectItem>
              {METRIC_COLUMNS.map((col) => (
                <SelectItem key={col.id as string} value={col.id as string}>
                  {col.header} (Cao → Thấp)
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
          {splitBy !== "NONE" && rows.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => setCollapsedKeys(allCollapsed ? [] : rows.map((r) => r.key))}
            >
              {allCollapsed ? "Mở rộng" : "Thu gọn"}
            </Button>
          )}
          <ColumnVisibilityPopover
            columns={METRIC_COLUMNS.map((c) => ({ id: c.id as string, header: c.header }))}
            visible={metrics}
            onChange={setMetrics}
            defaults={DEFAULT_METRICS}
          />
          <Button size="sm" className="ml-auto gap-1.5 sm:ml-0" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Xuất Excel
          </Button>
        </div>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="px-3.5 pt-3.5 sm:px-5 sm:pt-4">
          <div className="text-[15px] font-semibold">
            Bảng chỉ số theo {PIVOT_DIMENSIONS[groupBy].toLowerCase()}
            {splitBy !== "NONE" ? ` × ${PIVOT_DIMENSIONS[splitBy].toLowerCase()}` : ""}
          </div>
          <p className="mt-0.5 text-xs text-muted-foreground">
            KHQT+ gồm KHQT, GDTD và KHĐ.
            {splitBy !== "NONE" ? " Bấm vào từng mục để mở/đóng chi tiết 2 chiều." : ""}
          </p>
        </div>

        {/* MOBILE CARD VIEW (< 768px) — Không bao giờ phải cuộn ngang */}
        <div className="mt-3 divide-y divide-border/70 border-t border-border md:hidden">
          {pagedRows.length > 0 && (
            <div className="bg-primary/5 p-3.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-primary">Tổng toàn bảng</span>
                <span className="rounded-full bg-primary px-2.5 py-0.5 text-xs font-bold tabular-nums text-primary-foreground">
                  {formatNumber(pivot.total.leads)} lead
                </span>
              </div>
              <div className="mt-2 grid grid-cols-3 gap-1.5 text-xs">
                {visibleMetrics
                  .filter((c) => c.id !== "leads" && c.id !== "leadShare")
                  .map((col) => {
                    const rawVal = pivot.total[col.id] as number;
                    return (
                      <div key={col.id as string} className="min-w-0 rounded-lg bg-white/90 px-2 py-1.5 shadow-2xs">
                        <div className="truncate text-[10px] text-muted-foreground">{col.header}</div>
                        <div
                          className={cn(
                            "mt-0.5 font-semibold tabular-nums text-slate-800",
                            col.tone === "danger" && rawVal > 0 && "text-rose-600",
                            col.tone === "warning" && rawVal > 0 && "text-amber-600",
                            col.tone === "success" && rawVal > 0 && "text-emerald-700",
                          )}
                        >
                          {cellText(pivot.total, col)}
                        </div>
                      </div>
                    );
                  })}
              </div>
            </div>
          )}

          {pagedRows.length === 0 ? (
            <div className="px-4 py-10 text-center text-xs text-muted-foreground">
              Không có dữ liệu phù hợp bộ lọc hiện tại.
            </div>
          ) : (
            pagedRows.map((row) => {
              const isCollapsed = collapsedKeys.includes(row.key);
              const childKeys =
                splitBy !== "NONE"
                  ? pivot.splitKeys.filter((sKey) => Boolean(pivot.split[row.key]?.[sKey]))
                  : [];
              const hasChildren = childKeys.length > 0;

              return (
                <div key={row.key} className="p-3.5">
                  <div
                    role={hasChildren ? "button" : undefined}
                    tabIndex={hasChildren ? 0 : undefined}
                    onClick={hasChildren ? () => toggleRowCollapse(row.key) : undefined}
                    className={cn("space-y-2", hasChildren && "cursor-pointer")}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex min-w-0 flex-1 items-center gap-1.5">
                        {hasChildren &&
                          (isCollapsed ? (
                            <ChevronRight className="size-4 shrink-0 text-slate-400" />
                          ) : (
                            <ChevronDown className="size-4 shrink-0 text-primary" />
                          ))}
                        <span className="min-w-0 break-words text-[14px] font-bold text-slate-900">{row.key}</span>
                      </div>
                      <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-bold tabular-nums text-slate-800">
                        {formatNumber(row.leads)} ({formatPercent(row.leadShare)})
                      </span>
                    </div>

                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                      <div
                        className="h-full rounded-full bg-primary"
                        style={{ width: `${Math.max(4, (row.leads / maxLeads) * 100)}%` }}
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 rounded-lg bg-slate-50/85 p-2 text-xs">
                      {visibleMetrics
                        .filter((c) => c.id !== "leads" && c.id !== "leadShare")
                        .map((col) => {
                          const rawVal = row[col.id] as number;
                          return (
                            <div key={col.id as string} className="min-w-0">
                              <div className="truncate text-[10px] text-muted-foreground">{col.header}</div>
                              <div
                                className={cn(
                                  "mt-0.5 font-semibold tabular-nums text-slate-800",
                                  col.tone === "danger" && rawVal > 0 && "text-rose-600",
                                  col.tone === "warning" && rawVal > 0 && "text-amber-600",
                                  col.tone === "success" && rawVal > 0 && "text-emerald-700",
                                  col.tone === "muted" && "text-slate-600",
                                )}
                              >
                                {cellText(row, col)}
                              </div>
                            </div>
                          );
                        })}
                    </div>
                  </div>

                  {hasChildren && !isCollapsed && (
                    <div className="mt-2.5 space-y-1.5 border-l-2 border-primary/25 pl-3">
                      {childKeys.map((sKey) => {
                        const child = pivot.split[row.key]![sKey]!;
                        return (
                          <div key={`${row.key}-${sKey}`} className="rounded-lg border border-border/60 bg-white p-2.5 text-xs">
                            <div className="flex items-center justify-between gap-2 font-medium text-slate-700">
                              <span className="min-w-0 truncate">↳ {sKey}</span>
                              <span className="shrink-0 font-semibold tabular-nums text-slate-900">
                                {formatNumber(child.leads)} lead
                              </span>
                            </div>
                            <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-slate-600">
                              <span>
                                Đã LH: <strong className="tabular-nums text-slate-800">{formatPercent(child.contactRate)}</strong>
                              </span>
                              <span>
                                KHQT+: <strong className="tabular-nums text-emerald-700">{formatNumber(child.khqt)}</strong>
                              </span>
                              <span>
                                KHĐ: <strong className="tabular-nums text-primary">{formatNumber(child.khd)}</strong>
                              </span>
                              {child.failed > 0 && (
                                <span>
                                  Loại: <strong className="tabular-nums text-rose-600">{formatNumber(child.failed)}</strong>
                                </span>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* DESKTOP & TABLET TABLE (>= 768px) */}
        <div className="thin-scrollbar mt-3 hidden overflow-x-auto md:block">
          <table className="w-full min-w-max text-[13px]">
            <thead>
              <tr className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-slate-500">
                <th
                  className="sticky left-0 z-10 cursor-pointer bg-[#f8fafc] px-3 py-2 text-left font-semibold shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)]"
                  onClick={() => toggleSort("key")}
                >
                  <SortLabel label={PIVOT_DIMENSIONS[groupBy]} active={sortBy === "key"} order={sortOrder} />
                </th>
                {visibleMetrics.map((column) => (
                  <th
                    key={column.id as string}
                    title={column.hint}
                    className="cursor-pointer px-3 py-2 text-right font-semibold whitespace-nowrap"
                    onClick={() => toggleSort(column.id)}
                  >
                    <SortLabel label={column.header} active={sortBy === column.id} order={sortOrder} align="right" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {pagedRows.length === 0 ? (
                <tr>
                  <td
                    colSpan={visibleMetrics.length + 1}
                    className="px-4 py-8 text-center text-xs text-muted-foreground"
                  >
                    Không có dữ liệu phù hợp bộ lọc hiện tại.
                  </td>
                </tr>
              ) : (
                pagedRows.map((row) => {
                  const isCollapsed = collapsedKeys.includes(row.key);
                  const hasChildren =
                    splitBy !== "NONE" &&
                    pivot.splitKeys.some((sKey) => Boolean(pivot.split[row.key]?.[sKey]));

                  return (
                    <React.Fragment key={row.key}>
                      <tr
                        className={cn(
                          "group border-t border-border/70 hover:bg-[#f6f9ff]",
                          hasChildren && "cursor-pointer",
                        )}
                        onClick={() => hasChildren && toggleRowCollapse(row.key)}
                      >
                        <td className="sticky left-0 z-10 max-w-[180px] bg-card px-3 py-2 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] group-hover:bg-[#f6f9ff] sm:max-w-[260px]">
                          <div className="flex items-center gap-1.5 font-medium text-slate-800">
                            {hasChildren &&
                              (isCollapsed ? (
                                <ChevronRight className="size-3.5 shrink-0 text-slate-400" />
                              ) : (
                                <ChevronDown className="size-3.5 shrink-0 text-slate-500" />
                              ))}
                            <span className="truncate" title={row.key}>
                              {row.key}
                            </span>
                          </div>
                          <div className="mt-1 h-1 w-20 overflow-hidden rounded-full bg-slate-100 sm:w-24">
                            <div
                              className="h-full rounded-full bg-primary"
                              style={{ width: `${(row.leads / maxLeads) * 100}%` }}
                            />
                          </div>
                        </td>
                        {visibleMetrics.map((column) => {
                          const rawVal = row[column.id] as number;
                          return (
                            <td
                              key={column.id as string}
                              className={cn(
                                "px-3 py-2 text-right tabular-nums",
                                column.tone === "danger" && rawVal > 0 && "font-medium text-rose-600",
                                column.tone === "warning" && rawVal > 0 && "font-medium text-amber-600",
                                column.tone === "success" && rawVal > 0 && "font-medium text-emerald-700",
                                column.tone === "muted" && "text-slate-500",
                              )}
                            >
                              {cellText(row, column)}
                            </td>
                          );
                        })}
                      </tr>

                      {hasChildren &&
                        !isCollapsed &&
                        pivot.splitKeys
                          .filter((sKey) => Boolean(pivot.split[row.key]?.[sKey]))
                          .map((sKey) => {
                            const cell = pivot.split[row.key]![sKey]!;
                            return (
                              <tr
                                key={`${row.key}-${sKey}`}
                                className="border-t border-border/40 bg-[#fbfcfe] text-[12px]"
                              >
                                <td className="sticky left-0 z-10 max-w-[180px] truncate bg-[#fbfcfe] py-1.5 pr-3 pl-7 text-slate-500 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] sm:max-w-[260px] sm:pl-8">
                                  ↳ {sKey}
                                </td>
                                {visibleMetrics.map((column) => (
                                  <td
                                    key={column.id as string}
                                    className={cn(
                                      "px-3 py-1.5 text-right tabular-nums text-slate-500",
                                      column.tone === "danger" && (cell[column.id] as number) > 0 && "text-rose-500",
                                      column.tone === "success" && (cell[column.id] as number) > 0 && "text-emerald-600",
                                    )}
                                  >
                                    {cellText(cell, column)}
                                  </td>
                                ))}
                              </tr>
                            );
                          })}
                    </React.Fragment>
                  );
                })
              )}

              <tr className="border-t-2 border-border bg-[#f8fafc] font-semibold">
                <td className="sticky left-0 z-10 bg-[#f8fafc] px-3 py-2 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)]">
                  Tổng
                </td>
                {visibleMetrics.map((column) => (
                  <td
                    key={column.id as string}
                    className={cn(
                      "px-3 py-2 text-right tabular-nums",
                      column.tone === "danger" && (pivot.total[column.id] as number) > 0 && "text-rose-600",
                      column.tone === "warning" && (pivot.total[column.id] as number) > 0 && "text-amber-600",
                      column.tone === "success" && (pivot.total[column.id] as number) > 0 && "text-emerald-700",
                    )}
                  >
                    {cellText(pivot.total, column)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <Pagination
          page={safePage}
          pageSize={pageSize}
          total={rows.length}
          unit="nhóm"
          onPageChange={setPage}
          onPageSizeChange={(size) => {
            setPageSize(size);
            setPage(1);
          }}
        />

        <p className="border-t border-border px-3.5 py-3 text-[11px] text-muted-foreground sm:px-5">
          Xuất Excel gồm bảng đang xem (kèm các dòng con nếu chọn “Chi tiết 2 chiều”) + sheet cho từng chiều phân tích
          chính (nguồn, fanpage, phụ trách, trạng thái, sản phẩm).
        </p>
      </div>
    </div>
  );
}

function SortLabel({
  label,
  active,
  order,
  align = "left",
}: {
  label: string;
  active: boolean;
  order: "asc" | "desc";
  align?: "left" | "right";
}) {
  return (
    <span className={cn("inline-flex items-center gap-1", align === "right" && "flex-row-reverse")}>
      {label}
      {active ? (
        order === "asc" ? (
          <ArrowUp className="size-3" />
        ) : (
          <ArrowDown className="size-3" />
        )
      ) : (
        <ChevronsUpDown className="size-3 opacity-30" />
      )}
    </span>
  );
}
