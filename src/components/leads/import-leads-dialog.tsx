"use client";

import * as React from "react";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  FileUp,
  Loader2,
  Upload,
  XCircle,
} from "lucide-react";

import { commitLeadImportAction, validateLeadImportAction } from "@/app/leads/actions";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { ImportValidationReport, ValidatedImportRow } from "@/lib/leads/import-leads";
import { cn } from "@/lib/utils";

interface ImportLeadsDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDownloadTemplate: () => void;
  onImported: (count: number) => void;
}

type RowFilter = "ALL" | "IMPORTABLE" | "PARTIAL" | "BLOCKED";

export function ImportLeadsDialog({
  open,
  onOpenChange,
  onDownloadTemplate,
  onImported,
}: ImportLeadsDialogProps) {
  const toast = useToast();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [validating, setValidating] = React.useState(false);
  const [committing, setCommitting] = React.useState(false);
  const [commitProgress, setCommitProgress] = React.useState<{ done: number; total: number } | null>(null);
  const [report, setReport] = React.useState<ImportValidationReport | null>(null);
  const [filter, setFilter] = React.useState<RowFilter>("ALL");
  const [visibleLimit, setVisibleLimit] = React.useState(100);

  const reset = React.useCallback(() => {
    setFileName(null);
    setValidating(false);
    setCommitting(false);
    setCommitProgress(null);
    setReport(null);
    setFilter("ALL");
    setVisibleLimit(100);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (validating || committing) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setValidating(true);
    setReport(null);
    setVisibleLimit(100);

    try {
      const formData = new FormData();
      formData.append("file", file);
      const res = await validateLeadImportAction(formData);
      if (!res.ok) {
        toast.error("Không kiểm tra được file", res.error);
        return;
      }
      setReport(res.report);
      if (res.report.totalRows === 0) {
        toast.warning("File trống", "Không tìm thấy dòng dữ liệu nào trong file Excel.");
      }
    } finally {
      setValidating(false);
    }
  };

  const handleCommit = async () => {
    if (!report) return;
    const payloads = report.rows
      .filter((r) => r.canImport && r.payload !== null)
      .map((r) => r.payload!);

    if (payloads.length === 0) {
      toast.error("Không có dòng hợp lệ để import");
      return;
    }

    setCommitting(true);
    setCommitProgress({ done: 0, total: payloads.length });
    const CHUNK_SIZE = 400;
    let totalImported = 0;

    try {
      for (let i = 0; i < payloads.length; i += CHUNK_SIZE) {
        const chunk = payloads.slice(i, i + CHUNK_SIZE);
        const res = await commitLeadImportAction({ rows: chunk });
        if (!res.ok) {
          toast.error("Import thất bại", res.error);
          return;
        }
        totalImported += res.importedCount;
        setCommitProgress({
          done: Math.min(i + chunk.length, payloads.length),
          total: payloads.length,
        });
      }
      toast.success(
        "Import lead thành công",
        `Đã thêm ${totalImported} lead vào danh sách.`,
      );
      reset();
      onOpenChange(false);
      onImported(totalImported);
    } finally {
      setCommitting(false);
      setCommitProgress(null);
    }
  };

  const filteredRows = React.useMemo<ValidatedImportRow[]>(() => {
    if (!report) return [];
    switch (filter) {
      case "IMPORTABLE":
        return report.rows.filter((r) => r.canImport);
      case "PARTIAL":
        return report.rows.filter((r) => r.status === "partial");
      case "BLOCKED":
        return report.rows.filter((r) => !r.canImport);
      default:
        return report.rows;
    }
  }, [report, filter]);

  const displayedRows = React.useMemo(
    () => filteredRows.slice(0, visibleLimit),
    [filteredRows, visibleLimit],
  );

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div>
              <DialogTitle className="text-lg font-bold">Import lead từ Excel</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                Hệ thống tự động kiểm tra định dạng các trường, đối chiếu trùng số điện thoại và email trước khi lưu.
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={onDownloadTemplate}
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              Tải file mẫu (.xlsx)
            </Button>
          </div>
        </DialogHeader>

        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-6">
          {/* Khu vực chọn file */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-4 py-3.5">
            <div className="flex items-center gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileUp className="size-5" />
              </div>
              <div>
                <div className="text-sm font-semibold text-slate-800">
                  {fileName ?? "Chọn file Excel (.xlsx) để kiểm tra dữ liệu"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Các dòng trùng SĐT hoặc Email sẽ bị chặn; các dòng có trường hợp lệ vẫn được phép import.
                </div>
              </div>
            </div>

            <div>
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx"
                className="hidden"
                onChange={handleFileChange}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={validating || committing}
                onClick={() => fileInputRef.current?.click()}
                className="gap-1.5 bg-white"
              >
                {validating ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {fileName ? "Chọn file khác" : "Tải file lên"}
              </Button>
            </div>
          </div>

          {validating && (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="size-4 animate-spin text-primary" />
              Đang kiểm tra dữ liệu và đối chiếu trùng SĐT / Email...
            </div>
          )}

          {report && !validating && (
            <>
              {/* Thống kê tổng quan */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <button
                  type="button"
                  onClick={() => setFilter("ALL")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    filter === "ALL"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-muted-foreground">
                    Tổng số dòng
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-slate-900">
                    {report.totalRows}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter("IMPORTABLE")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    filter === "IMPORTABLE"
                      ? "border-emerald-500 bg-emerald-50/70"
                      : "border-emerald-200 bg-emerald-50/30 hover:bg-emerald-50/60",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-emerald-700">
                    Cho phép import
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-emerald-700">
                    {report.importableCount}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter("PARTIAL")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    filter === "PARTIAL"
                      ? "border-amber-500 bg-amber-50/70"
                      : "border-amber-200 bg-amber-50/30 hover:bg-amber-50/60",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-amber-700">
                    Có field lỗi (bỏ qua field sai)
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-amber-700">
                    {report.partialValidCount}
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setFilter("BLOCKED")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    filter === "BLOCKED"
                      ? "border-rose-500 bg-rose-50/70"
                      : "border-rose-200 bg-rose-50/30 hover:bg-rose-50/60",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-rose-700">
                    Không cho import (Trùng / Lỗi SĐT)
                  </div>
                  <div className="mt-1 text-xl font-bold tabular-nums text-rose-700">
                    {report.blockedCount}
                  </div>
                </button>
              </div>

              {report.unrecognizedColumns.length > 0 && (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs text-amber-800">
                  <AlertTriangle className="mt-0.5 size-4 shrink-0 text-amber-600" />
                  <div>
                    <strong>Cột không khớp cấu hình dự án:</strong>{" "}
                    {report.unrecognizedColumns.join(", ")}. Các cột này sẽ bị bỏ qua khi import; những trường hợp lệ khác vẫn được lưu bình thường.
                  </div>
                </div>
              )}

              {/* Bảng chi tiết từng dòng */}
              <div className="overflow-hidden rounded-lg border border-border">
                <div className="max-h-[380px] overflow-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border bg-slate-100 text-[11px] font-semibold uppercase text-slate-600">
                      <tr>
                        <th className="w-16 px-3 py-2.5">Dòng</th>
                        <th className="w-48 px-3 py-2.5">Khách hàng / SĐT</th>
                        <th className="w-40 px-3 py-2.5">Kết quả</th>
                        <th className="px-3 py-2.5">Trường hợp lệ (sẽ lưu)</th>
                        <th className="px-3 py-2.5">Trường không hợp lệ / Lý do lỗi</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {displayedRows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                            Không có dòng nào trong nhóm lọc này.
                          </td>
                        </tr>
                      ) : (
                        displayedRows.map((row) => (
                          <tr
                            key={row.rowNumber}
                            className={cn(
                              "align-top",
                              !row.canImport && "bg-rose-50/30",
                              row.status === "partial" && "bg-amber-50/20",
                            )}
                          >
                            <td className="px-3 py-2.5 font-mono font-semibold text-slate-500">
                              #{row.rowNumber}
                            </td>
                            <td className="px-3 py-2.5">
                              <div className="font-semibold text-slate-800">
                                {row.name || <span className="italic text-slate-400">Chưa có tên</span>}
                              </div>
                              <div className="tabular-nums text-slate-600">
                                {row.phone || <span className="text-rose-500">Thiếu SĐT</span>}
                              </div>
                              {row.email && (
                                <div className="truncate text-[11px] text-slate-500">{row.email}</div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.status === "valid" && (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-700">
                                  <CheckCircle2 className="size-3 shrink-0" />
                                  Hợp lệ
                                </span>
                              )}
                              {row.status === "partial" && (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
                                  <AlertTriangle className="size-3 shrink-0" />
                                  Có field sai (vẫn import)
                                </span>
                              )}
                              {row.status === "blocked" && (
                                <span className="inline-flex items-center gap-1 whitespace-nowrap rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-medium text-rose-700">
                                  <XCircle className="size-3 shrink-0" />
                                  Không cho import
                                </span>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.validFields.length === 0 ? (
                                <span className="text-slate-400">—</span>
                              ) : (
                                <div className="flex flex-wrap gap-1">
                                  {row.validFields.map((vf, idx) => (
                                    <span
                                      key={idx}
                                      className="inline-flex items-center rounded border border-emerald-200/80 bg-emerald-50/70 px-1.5 py-0.5 text-[11px] text-emerald-800"
                                    >
                                      <strong className="mr-1 font-medium">{vf.field}:</strong>
                                      <span className="max-w-[160px] truncate">{vf.value}</span>
                                    </span>
                                  ))}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2.5">
                              {row.invalidFields.length === 0 ? (
                                <span className="text-emerald-600">Tất cả trường hợp lệ</span>
                              ) : (
                                <div className="space-y-1">
                                  {row.invalidFields.map((inf, idx) => (
                                    <div
                                      key={idx}
                                      className="rounded border border-rose-200 bg-rose-50/80 px-2 py-1 text-[11px] text-rose-800"
                                    >
                                      <strong>{inf.field}</strong> ({inf.value}): {inf.error}
                                    </div>
                                  ))}
                                </div>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
                {filteredRows.length > visibleLimit && (
                  <div className="flex items-center justify-between border-t border-border bg-slate-50 px-3 py-2 text-xs text-muted-foreground">
                    <span>
                      Đang hiển thị <strong>{displayedRows.length}</strong> /{" "}
                      <strong>{filteredRows.length}</strong> dòng trong nhóm lọc
                    </span>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-7 text-xs"
                      onClick={() => setVisibleLimit((prev) => prev + 200)}
                    >
                      Xem thêm 200 dòng
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-slate-50/70 px-6 py-3">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={validating || committing}
            onClick={() => onOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!report || report.importableCount === 0 || validating || committing}
            onClick={handleCommit}
            className="gap-1.5"
          >
            {committing ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Upload className="size-3.5" />
            )}
            {committing && commitProgress
              ? `Đang lưu (${commitProgress.done}/${commitProgress.total})...`
              : report && report.importableCount > 0
                ? `Import ${report.importableCount} lead hợp lệ`
                : "Import lead"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
