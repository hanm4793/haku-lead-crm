"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Download, FileSpreadsheet, Filter, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { COLUMN_BY_ID } from "@/components/leads/columns";
import type { ExportPreview } from "@/lib/ai/export-preview";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { CATEGORY_SHORT_LABEL, FAIL_REASON_LABEL, SOURCE_LABEL } from "@/lib/constants";
import { downloadExport } from "@/lib/export/download";
import { exportSpecToFilters } from "@/lib/export/to-filters";
import { PIVOT_DIMENSIONS, type PivotDimension } from "@/lib/metrics";
import type { FailReason, LeadCategory, LeadSource } from "@/lib/types";
import { formatDate, formatNumber } from "@/lib/utils";
import { useLeadStore } from "@/store/lead-store";

function describeFilters(spec: ExportSpec): string[] {
  const f = spec.filters ?? {};
  const chips: string[] = [];

  if (f.dateFrom || f.dateTo) {
    chips.push(`${f.dateFrom ? formatDate(f.dateFrom) : "…"} → ${f.dateTo ? formatDate(f.dateTo) : "…"}`);
  }
  if (f.contactStatus) chips.push(f.contactStatus === "DA_LIEN_HE" ? "Đã liên hệ" : "Chưa liên hệ");
  if (f.categories?.length) chips.push(f.categories.map((c) => CATEGORY_SHORT_LABEL[c as LeadCategory]).join(" / "));
  if (f.failReasons?.length) chips.push(f.failReasons.map((r) => FAIL_REASON_LABEL[r as FailReason]).join(" / "));
  if (f.sources?.length) chips.push(f.sources.map((s) => SOURCE_LABEL[s as LeadSource]).join(" / "));
  if (f.brands?.length) chips.push(f.brands.join(" / "));
  if (f.carModels?.length) chips.push(f.carModels.join(" / "));
  if (f.showrooms?.length) chips.push(`SR ${f.showrooms.join(" / ")}`);
  if (f.salesRooms?.length) chips.push(f.salesRooms.join(" / "));
  if (f.assignees?.length) chips.push(f.assignees.join(" / "));
  if (f.b10 && f.b10 !== "ALL") chips.push(f.b10 === "PUSHED" ? "Đã lên B10" : "Chưa lên B10");
  if (f.overdueOnly) chips.push("Quá hạn gọi lại");
  if (f.search) chips.push(`Tìm "${f.search}"`);

  return chips.length ? chips : ["Toàn bộ lead"];
}

export function ExportPreviewCard({ spec, preview }: { spec: ExportSpec; preview: ExportPreview }) {
  const router = useRouter();
  const replaceFilters = useLeadStore((s) => s.replaceFilters);
  const [busy, setBusy] = React.useState<"xlsx" | "csv" | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const run = async (format: "xlsx" | "csv") => {
    setBusy(format);
    setError(null);
    try {
      await downloadExport({ ...spec, format });
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không tạo được file");
    } finally {
      setBusy(null);
    }
  };

  const applyToList = () => {
    replaceFilters(exportSpecToFilters(spec));
    router.push("/leads");
  };

  const columnLabels = spec.columns.map((id) => COLUMN_BY_ID.get(id)?.header ?? id);

  return (
    <div className="rounded-lg border border-border bg-card p-3 text-[13px] shadow-xs">
      <div className="flex items-center gap-2 text-primary">
        <FileSpreadsheet className="size-4" />
        <span className="font-semibold">Bản xem trước file export</span>
      </div>

      <p className="mt-2 text-slate-700">{spec.summary}</p>

      <div className="mt-3 grid grid-cols-2 gap-2">
        <Stat label="Số lead" value={formatNumber(preview.total)} highlight />
        <Stat label="Số cột" value={String(spec.columns.length)} />
        {preview.kpis.map((kpi) => (
          <Stat key={kpi.label} label={kpi.label} value={kpi.value} />
        ))}
      </div>

      <div className="mt-3">
        <Caption>Bộ lọc áp dụng</Caption>
        <div className="mt-1 flex flex-wrap gap-1">
          {describeFilters(spec).map((chip) => (
            <span key={chip} className="rounded-full bg-secondary px-2 py-0.5 text-[11px] text-secondary-foreground">
              {chip}
            </span>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <Caption>Cột xuất ra</Caption>
        <p className="mt-1 text-[12px] text-muted-foreground">{columnLabels.join(" · ")}</p>
      </div>

      {spec.splitSheetsBy && (
        <div className="mt-3">
          <Caption>
            Tách {preview.sheets.length} sheet theo {PIVOT_DIMENSIONS[spec.splitSheetsBy as PivotDimension]}
          </Caption>
          <div className="thin-scrollbar mt-1 max-h-28 space-y-0.5 overflow-y-auto pr-1">
            {preview.sheets.map((sheet) => (
              <div key={sheet.name} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="truncate text-slate-600">{sheet.name}</span>
                <span className="shrink-0 tabular-nums text-muted-foreground">{sheet.count}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {error && <p className="mt-2 text-[12px] text-rose-600">{error}</p>}

      <div className="mt-3 flex flex-wrap gap-2">
        <Button size="sm" className="gap-1.5" onClick={() => run("xlsx")} disabled={busy !== null || preview.total === 0}>
          {busy === "xlsx" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          Tải Excel
        </Button>
        <Button size="sm" variant="outline" className="gap-1.5" onClick={() => run("csv")} disabled={busy !== null || preview.total === 0}>
          {busy === "csv" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
          CSV
        </Button>
        <Button size="sm" variant="ghost" className="gap-1.5" onClick={applyToList}>
          <Filter className="size-3.5" />
          Áp lên danh sách
        </Button>
      </div>

      {preview.total === 0 && (
        <p className="mt-2 text-[12px] text-amber-600">Không có lead nào khớp bộ lọc này — thử nới điều kiện lại.</p>
      )}
    </div>
  );
}

function Stat({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className="rounded-md bg-[#f7f9fc] px-2.5 py-1.5">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className={highlight ? "text-base font-bold text-primary tabular-nums" : "text-sm font-semibold tabular-nums"}>
        {value}
      </div>
    </div>
  );
}

function Caption({ children }: { children: React.ReactNode }) {
  return <div className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{children}</div>;
}
