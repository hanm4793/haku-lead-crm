"use client";

import * as React from "react";
import { ArrowDown, ArrowUp, ChevronsUpDown, Download, Loader2 } from "lucide-react";

import { ColumnVisibilityPopover } from "@/components/common/column-visibility";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PIVOT_DIMENSIONS, type PivotDimension, type PivotResult, type PivotRow } from "@/lib/metrics";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface MetricColumn {
  id: keyof PivotRow;
  header: string;
  kind: "count" | "percent";
  tone?: "danger" | "muted";
}

const METRIC_COLUMNS: MetricColumn[] = [
  { id: "leads", header: "Lead", kind: "count" },
  { id: "leadShare", header: "Tỷ trọng lead", kind: "percent", tone: "muted" },
  { id: "contacted", header: "Đã LH", kind: "count" },
  { id: "contactRate", header: "Tỷ lệ LH", kind: "percent", tone: "muted" },
  { id: "khqt", header: "KHQT", kind: "count" },
  { id: "gdtd", header: "GDTD", kind: "count" },
  { id: "khd", header: "KHĐ", kind: "count" },
  { id: "signRate", header: "Tỷ lệ ký HĐ", kind: "percent", tone: "muted" },
  { id: "failed", header: "Loại", kind: "count", tone: "danger" },
  { id: "failRate", header: "Tỷ lệ loại", kind: "percent", tone: "danger" },
  { id: "overdue", header: "Quá hạn", kind: "count" },
  { id: "pushedB10", header: "Lên B10", kind: "count" },
  { id: "b10Rate", header: "% B10", kind: "percent", tone: "muted" },
  { id: "khqtB10", header: "KHQT-B10", kind: "count" },
  { id: "gdtdB10", header: "GDTD-B10", kind: "count" },
  { id: "khdB10", header: "KHĐ-B10", kind: "count" },
  { id: "failedB10", header: "Loại-B10", kind: "count", tone: "danger" },
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
}: {
  pivot: PivotResult;
  pivotByDimension: Record<string, PivotResult>;
  groupBy: PivotDimension;
  splitBy: PivotDimension | "NONE";
  onGroupByChange: (dim: PivotDimension) => void;
  onSplitByChange: (dim: PivotDimension | "NONE") => void;
}) {
  const [metrics, setMetrics] = React.useState<string[]>(DEFAULT_METRICS);
  const [sortBy, setSortBy] = React.useState<keyof PivotRow>("leads");
  const [sortOrder, setSortOrder] = React.useState<"asc" | "desc">("desc");
  const [exporting, setExporting] = React.useState(false);

  const visibleMetrics = METRIC_COLUMNS.filter((c) => metrics.includes(c.id as string));

  const rows = React.useMemo(() => {
    const dir = sortOrder === "asc" ? 1 : -1;
    return [...pivot.rows].sort((a, b) => {
      if (sortBy === "key") return a.key.localeCompare(b.key, "vi") * dir;
      return ((a[sortBy] as number) - (b[sortBy] as number)) * dir;
    });
  }, [pivot.rows, sortBy, sortOrder]);

  const maxLeads = Math.max(...pivot.rows.map((r) => r.leads), 1);

  const toggleSort = (id: keyof PivotRow) => {
    if (sortBy === id) setSortOrder((o) => (o === "asc" ? "desc" : "asc"));
    else {
      setSortBy(id);
      setSortOrder("desc");
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const buildSheet = (dim: PivotDimension, result: PivotResult) => {
        return {
          name: PIVOT_DIMENSIONS[dim],
          columns: [
            { key: "key", header: PIVOT_DIMENSIONS[dim], width: 26 },
            ...visibleMetrics.map((c) => ({ key: c.id as string, header: c.header, width: 14 })),
          ],
          rows: [...result.rows, result.total].map((row) => ({
            key: row.key,
            ...Object.fromEntries(
              visibleMetrics.map((c) => [
                c.id as string,
                c.kind === "percent" ? Number((row[c.id] as number).toFixed(1)) : (row[c.id] as number),
              ]),
            ),
          })),
        };
      };

      // File gồm bảng đang xem + một sheet cho mỗi chiều phân tích chính.
      const extraDims = (Object.keys(pivotByDimension) as PivotDimension[]).filter((d) => d !== groupBy);
      const sheets = [
        buildSheet(groupBy, pivot),
        ...extraDims.map((dim) => buildSheet(dim, pivotByDimension[dim])),
      ];

      const response = await fetch("/api/export/table", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ filename: `bao-cao-${groupBy}`, sheets }),
      });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `bao-cao-chi-tiet.xlsx`;
      anchor.click();
      URL.revokeObjectURL(url);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
        <div className="space-y-1">
          <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Nhóm theo</Label>
          <Select value={groupBy} onValueChange={(v) => onGroupByChange(v as PivotDimension)}>
            <SelectTrigger size="sm" className="w-44">
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
          <Label className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Tách cột</Label>
          <Select value={splitBy} onValueChange={(v) => onSplitByChange(v as PivotDimension | "NONE")}>
            <SelectTrigger size="sm" className="w-44">
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

        <div className="ml-auto flex items-center gap-2">
          <ColumnVisibilityPopover
            columns={METRIC_COLUMNS.map((c) => ({ id: c.id as string, header: c.header }))}
            visible={metrics}
            onChange={setMetrics}
            defaults={DEFAULT_METRICS}
          />
          <Button size="sm" className="gap-2" onClick={handleExport} disabled={exporting}>
            {exporting ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
            Xuất Excel
          </Button>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-card shadow-xs">
        <div className="px-5 pt-4">
          <div className="text-[15px] font-semibold">Bảng chỉ số theo {PIVOT_DIMENSIONS[groupBy].toLowerCase()}</div>
          <p className="text-xs text-muted-foreground">
            Bấm tiêu đề cột để sắp xếp — chọn cột ở nút Cột hiển thị
          </p>
        </div>

        <div className="thin-scrollbar mt-3 overflow-x-auto">
          <table className="w-full min-w-max text-[13px]">
            <thead>
              <tr className="bg-[#f8fafc] text-[10px] uppercase tracking-wide text-slate-500">
                <th
                  className="sticky left-0 z-10 cursor-pointer bg-[#f8fafc] px-3 py-2 text-left font-semibold"
                  onClick={() => toggleSort("key")}
                >
                  <SortLabel label={PIVOT_DIMENSIONS[groupBy]} active={sortBy === "key"} order={sortOrder} />
                </th>
                {visibleMetrics.map((column) => (
                  <th
                    key={column.id as string}
                    className="cursor-pointer px-3 py-2 text-right font-semibold whitespace-nowrap"
                    onClick={() => toggleSort(column.id)}
                  >
                    <SortLabel label={column.header} active={sortBy === column.id} order={sortOrder} align="right" />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <React.Fragment key={row.key}>
                  <tr className="border-t border-border/70 hover:bg-[#f6f9ff]">
                    <td className="sticky left-0 z-10 bg-card px-3 py-2">
                      <div className="font-medium text-slate-800">{row.key}</div>
                      <div className="mt-1 h-1 w-24 overflow-hidden rounded-full bg-slate-100">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${(row.leads / maxLeads) * 100}%` }} />
                      </div>
                    </td>
                    {visibleMetrics.map((column) => (
                      <td
                        key={column.id as string}
                        className={cn(
                          "px-3 py-2 text-right tabular-nums",
                          column.tone === "danger" && "text-rose-600",
                          column.tone === "muted" && "text-slate-500",
                        )}
                      >
                        {cellText(row, column)}
                      </td>
                    ))}
                  </tr>

                  {splitBy !== "NONE" &&
                    pivot.splitKeys
                      .filter((sKey) => Boolean(pivot.split[row.key]?.[sKey]))
                      .map((sKey) => {
                        const cell = pivot.split[row.key]![sKey]!;
                        return (
                          <tr key={`${row.key}-${sKey}`} className="border-t border-border/40 bg-[#fbfcfe] text-[12px]">
                            <td className="sticky left-0 z-10 bg-[#fbfcfe] py-1.5 pl-8 pr-3 text-slate-500">{sKey}</td>
                            {visibleMetrics.map((column) => (
                              <td
                                key={column.id as string}
                                className={cn("px-3 py-1.5 text-right tabular-nums text-slate-500", column.tone === "danger" && "text-rose-400")}
                              >
                                {cellText(cell, column)}
                              </td>
                            ))}
                          </tr>
                        );
                      })}
                </React.Fragment>
              ))}

              <tr className="border-t-2 border-border bg-[#f8fafc] font-semibold">
                <td className="sticky left-0 z-10 bg-[#f8fafc] px-3 py-2">Tổng</td>
                {visibleMetrics.map((column) => (
                  <td
                    key={column.id as string}
                    className={cn("px-3 py-2 text-right tabular-nums", column.tone === "danger" && "text-rose-600")}
                  >
                    {cellText(pivot.total, column)}
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>

        <p className="px-5 py-3 text-[11px] text-muted-foreground">
          Nút Xuất Excel tạo file .xlsx gồm bảng đang xem + 1 sheet cho mỗi chiều (Dòng xe, Nguồn, Trạng thái).
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
