"use client";

import * as React from "react";
import {
  CheckCircle2,
  FileUp,
  Layers,
  Loader2,
  Sparkles,
  Upload,
} from "lucide-react";

import {
  analyzeAttrFieldsFromExcelAction,
  bulkCreateAttrFieldsAction,
} from "@/app/settings/attr-field-actions";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AttrFieldType } from "@/lib/db/attr-fields-repo";
import type {
  AnalyzeAttrFieldsReport,
  AnalyzedAttrColumn,
} from "@/lib/leads/analyze-attr-fields";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<AttrFieldType, string> = {
  text: "Văn bản",
  number: "Số",
  date: "Ngày tháng",
  select: "Danh sách (chọn 1)",
  multiselect: "Danh sách (chọn nhiều)",
  boolean: "Có / Không",
};

type EditableColumnDraft = AnalyzedAttrColumn & {
  selected: boolean;
  optionsText: string;
};

type TabFilter = "ALL" | "SUGGESTED" | "SKIPPED";

export function ImportAttrFieldsDialog({
  open,
  onOpenChange,
  projectId,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId?: string;
  onCreated: () => void;
}) {
  const toast = useToast();
  const fileInputRef = React.useRef<HTMLInputElement | null>(null);

  const [fileName, setFileName] = React.useState<string | null>(null);
  const [analyzing, setAnalyzing] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [report, setReport] = React.useState<AnalyzeAttrFieldsReport | null>(null);
  const [drafts, setDrafts] = React.useState<EditableColumnDraft[]>([]);
  const [tabFilter, setTabFilter] = React.useState<TabFilter>("SUGGESTED");

  const reset = React.useCallback(() => {
    setFileName(null);
    setAnalyzing(false);
    setSaving(false);
    setReport(null);
    setDrafts([]);
    setTabFilter("SUGGESTED");
    if (fileInputRef.current) fileInputRef.current.value = "";
  }, []);

  const handleOpenChange = (next: boolean) => {
    if (analyzing || saving) return;
    if (!next) reset();
    onOpenChange(next);
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    setAnalyzing(true);
    setReport(null);
    setDrafts([]);

    try {
      const formData = new FormData();
      formData.append("file", file);
      if (projectId) formData.append("projectId", projectId);

      const res = await analyzeAttrFieldsFromExcelAction(formData);
      if (!res.ok) {
        toast.error("Không phân tích được file", res.error);
        return;
      }

      setReport(res.report);
      const nextDrafts: EditableColumnDraft[] = res.report.columns.map((c) => ({
        ...c,
        selected: c.status === "suggested",
        optionsText: c.options.join(", "),
      }));
      setDrafts(nextDrafts);

      const suggestedCount = nextDrafts.filter((d) => d.status === "suggested").length;
      setTabFilter(suggestedCount > 0 ? "SUGGESTED" : "ALL");
    } finally {
      setAnalyzing(false);
    }
  };

  const updateDraft = (
    columnIndex: number,
    patch: Partial<EditableColumnDraft>,
  ) => {
    setDrafts((prev) =>
      prev.map((d) => (d.columnIndex === columnIndex ? { ...d, ...patch } : d)),
    );
  };

  const suggestedDrafts = React.useMemo(
    () => drafts.filter((d) => d.status === "suggested"),
    [drafts],
  );
  const skippedDrafts = React.useMemo(
    () => drafts.filter((d) => d.status !== "suggested"),
    [drafts],
  );
  const selectedDrafts = React.useMemo(
    () => drafts.filter((d) => d.selected),
    [drafts],
  );

  const visibleDrafts = React.useMemo(() => {
    if (tabFilter === "SUGGESTED") return suggestedDrafts;
    if (tabFilter === "SKIPPED") return skippedDrafts;
    return drafts;
  }, [drafts, suggestedDrafts, skippedDrafts, tabFilter]);

  const allSuggestedSelected =
    suggestedDrafts.length > 0 && suggestedDrafts.every((d) => d.selected);

  const toggleAllSuggested = (checked: boolean) => {
    setDrafts((prev) =>
      prev.map((d) =>
        d.status === "suggested" ? { ...d, selected: checked } : d,
      ),
    );
  };

  const handleSave = async () => {
    if (selectedDrafts.length === 0) {
      toast.warning("Chưa chọn field nào", "Hãy tích chọn ít nhất 1 cột để tạo field phụ.");
      return;
    }

    for (const d of selectedDrafts) {
      if (!d.label.trim()) {
        toast.error("Thiếu nhãn hiển thị", `Cột #${d.columnIndex} (${d.rawHeader}) chưa có nhãn hiển thị.`);
        return;
      }
      if (d.fieldType === "select" || d.fieldType === "multiselect") {
        const opts = d.optionsText
          .split(/[,;\n]/)
          .map((s) => s.trim())
          .filter(Boolean);
        if (opts.length === 0) {
          toast.error(
            "Thiếu danh sách lựa chọn",
            `Field «${d.label}» có kiểu danh sách nhưng chưa nhập các lựa chọn (cách nhau bằng dấu phẩy).`,
          );
          return;
        }
      }
    }

    setSaving(true);
    try {
      const payloadFields = selectedDrafts.map((d) => ({
        label: d.label.trim(),
        key: d.key.trim() || undefined,
        fieldType: d.fieldType,
        options:
          d.fieldType === "select" || d.fieldType === "multiselect"
            ? d.optionsText
                .split(/[,;\n]/)
                .map((s) => s.trim())
                .filter(Boolean)
            : undefined,
        required: d.required,
      }));

      const res = await bulkCreateAttrFieldsAction({
        projectId,
        fields: payloadFields,
      });

      if (!res.ok) {
        toast.error("Tạo field phụ thất bại", res.error);
        return;
      }

      toast.success(
        "Đã tạo cấu hình field phụ",
        `Đã thêm ${res.createdCount} field mới vào dự án${res.skippedCount > 0 ? ` (bỏ qua ${res.skippedCount} field trùng key)` : ""}.`,
      );
      reset();
      onOpenChange(false);
      onCreated();
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92dvh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-4 py-3.5 sm:px-6 sm:py-4">
          <div className="flex flex-wrap items-center justify-between gap-2 pr-8">
            <div className="min-w-0">
              <DialogTitle className="flex items-center gap-2 text-base font-bold sm:text-lg">
                <Sparkles className="size-4 shrink-0 text-primary" />
                <span>Tự động tạo Field phụ từ file dữ liệu mẫu (AI)</span>
              </DialogTitle>
              <DialogDescription className="mt-0.5 text-xs text-muted-foreground">
                Tải lên file Excel dữ liệu khách hàng có sẵn. Hệ thống và AI sẽ tự nhận diện dòng tiêu đề, lọc bỏ trường cố định, gợi ý nhãn, mã key và kiểu dữ liệu phù hợp.
              </DialogDescription>
            </div>
            {report && (
              <Badge variant={report.mode === "ai" ? "info" : "muted"} className="gap-1">
                <Sparkles className="size-3" />
                {report.mode === "ai"
                  ? "Đã chuẩn hóa bằng AI"
                  : "Phân tích cấu trúc tự động"}
              </Badge>
            )}
          </div>
        </DialogHeader>

        <div className="thin-scrollbar flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto overscroll-contain p-4 sm:p-6">
          {/* Khu vực chọn file */}
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-dashed border-slate-300 bg-slate-50/70 px-3.5 py-3 sm:px-4 sm:py-3.5">
            <div className="flex min-w-0 items-start gap-3 sm:items-center">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <FileUp className="size-5" />
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-slate-800">
                  {fileName ?? "Chọn file Excel dữ liệu mẫu (.xlsx)"}
                </div>
                <div className="text-xs text-muted-foreground">
                  Hỗ trợ cả file có dòng tiêu đề gộp nhóm. Sau khi tạo xong field phụ, bạn có thể sang màn Quản lý Lead để import toàn bộ dữ liệu khách hàng.
                </div>
              </div>
            </div>

            <div className="w-full sm:w-auto">
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
                disabled={analyzing || saving}
                onClick={() => fileInputRef.current?.click()}
                className="w-full gap-1.5 bg-white sm:w-auto"
              >
                {analyzing ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <Upload className="size-3.5" />
                )}
                {fileName ? "Chọn file khác" : "Tải file mẫu lên"}
              </Button>
            </div>
          </div>

          {analyzing && (
            <div className="flex flex-col items-center justify-center gap-2 py-12 text-center text-sm text-muted-foreground">
              <Loader2 className="size-5 animate-spin text-primary" />
              <span>Đang đọc cấu trúc cột, mẫu dữ liệu và phân tích kiểu trường bằng AI...</span>
            </div>
          )}

          {report && !analyzing && (
            <>
              {/* Bộ lọc nhóm cột */}
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3 sm:gap-3">
                <button
                  type="button"
                  onClick={() => setTabFilter("SUGGESTED")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tabFilter === "SUGGESTED"
                      ? "border-primary bg-primary/5"
                      : "border-border bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-primary">
                    Đề xuất tạo mới
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold tabular-nums text-slate-900">
                      {suggestedDrafts.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Đang chọn: {selectedDrafts.length})
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTabFilter("SKIPPED")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tabFilter === "SKIPPED"
                      ? "border-slate-500 bg-slate-100/70"
                      : "border-border bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-slate-600">
                    Trường mặc định / Đã tồn tại
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold tabular-nums text-slate-700">
                      {skippedDrafts.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      cột (tự động bỏ qua)
                    </span>
                  </div>
                </button>

                <button
                  type="button"
                  onClick={() => setTabFilter("ALL")}
                  className={cn(
                    "rounded-lg border p-3 text-left transition-colors",
                    tabFilter === "ALL"
                      ? "border-emerald-500 bg-emerald-50/60"
                      : "border-border bg-white hover:bg-slate-50",
                  )}
                >
                  <div className="text-[11px] font-medium uppercase text-emerald-700">
                    Tổng số cột trong file
                  </div>
                  <div className="mt-1 flex items-baseline gap-2">
                    <span className="text-xl font-bold tabular-nums text-emerald-700">
                      {drafts.length}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      (Tiêu đề ở dòng #{report.headerRowIndex})
                    </span>
                  </div>
                </button>
              </div>

              {/* ========================================================= */}
              {/* MOBILE CARD LIST (< 768px)                                */}
              {/* ========================================================= */}
              <div className="space-y-2.5 md:hidden">
                {suggestedDrafts.length > 0 && (
                  <label className="flex items-center justify-between gap-3 rounded-xl border border-border bg-slate-50/80 px-3.5 py-2.5 text-xs font-medium text-slate-700">
                    <span>Chọn tất cả cột đề xuất ({suggestedDrafts.length})</span>
                    <Checkbox
                      checked={allSuggestedSelected}
                      onCheckedChange={(c) => toggleAllSuggested(Boolean(c))}
                      aria-label="Chọn tất cả cột đề xuất"
                    />
                  </label>
                )}

                {visibleDrafts.length === 0 ? (
                  <div className="rounded-xl border border-border bg-white px-4 py-8 text-center text-xs text-muted-foreground">
                    Không có cột nào trong nhóm này.
                  </div>
                ) : (
                  visibleDrafts.map((col) => {
                    const isDisabledStatus = col.status !== "suggested";
                    return (
                      <div
                        key={col.columnIndex}
                        className={cn(
                          "space-y-3 rounded-xl border p-3.5 transition-colors",
                          col.selected
                            ? "border-border bg-white shadow-2xs"
                            : "border-border/70 bg-slate-50/70 text-slate-600",
                        )}
                      >
                        <div className="flex items-start justify-between gap-2.5">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-1.5 font-semibold text-slate-900">
                              <span className="font-mono text-[11px] text-slate-400">
                                #{col.columnIndex}
                              </span>
                              <span className="break-words text-sm">{col.rawHeader}</span>
                            </div>
                            {col.sampleValues.length > 0 ? (
                              <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                                Mẫu:{" "}
                                <span className="italic text-slate-700">
                                  {col.sampleValues.slice(0, 3).join(" · ")}
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1 text-[11px] italic text-slate-400">
                                (Cột trống trong các dòng đầu)
                              </div>
                            )}
                            <div className="mt-1.5">
                              {col.status === "core" && (
                                <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10.5px] font-medium text-blue-700">
                                  <Layers className="size-2.5" />
                                  {col.statusNote}
                                </span>
                              )}
                              {col.status === "existing" && (
                                <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10.5px] font-medium text-emerald-700">
                                  <CheckCircle2 className="size-2.5" />
                                  {col.statusNote}
                                </span>
                              )}
                              {col.status === "suggested" && (
                                <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                  {col.statusNote}
                                </span>
                              )}
                            </div>
                          </div>

                          <Checkbox
                            checked={col.selected}
                            disabled={isDisabledStatus}
                            onCheckedChange={(c) =>
                              updateDraft(col.columnIndex, {
                                selected: Boolean(c),
                              })
                            }
                            aria-label={`Chọn cột ${col.rawHeader}`}
                            className="mt-0.5 size-5"
                          />
                        </div>

                        {!isDisabledStatus && (
                          <div className="space-y-2.5 border-t border-border/60 pt-2.5">
                            <div className="grid grid-cols-1 gap-2">
                              <div>
                                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                  Nhãn hiển thị
                                </div>
                                <Input
                                  value={col.label}
                                  onChange={(e) =>
                                    updateDraft(col.columnIndex, {
                                      label: e.target.value,
                                    })
                                  }
                                  placeholder="Nhãn hiển thị"
                                  className="h-9 font-medium"
                                />
                              </div>

                              <div>
                                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                  Mã key (tự sinh nếu để trống)
                                </div>
                                <Input
                                  value={col.key}
                                  onChange={(e) =>
                                    updateDraft(col.columnIndex, {
                                      key: e.target.value,
                                    })
                                  }
                                  placeholder="ma_key"
                                  className="h-9 font-mono text-slate-600"
                                />
                              </div>
                            </div>

                            <div className="space-y-2">
                              <div>
                                <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                  Kiểu dữ liệu
                                </div>
                                <Select
                                  value={col.fieldType}
                                  onValueChange={(v) =>
                                    updateDraft(col.columnIndex, {
                                      fieldType: v as AttrFieldType,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-9 w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      Object.entries(TYPE_LABELS) as [
                                        AttrFieldType,
                                        string,
                                      ][]
                                    ).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>

                              {(col.fieldType === "select" ||
                                col.fieldType === "multiselect") && (
                                <div>
                                  <div className="mb-1 text-[11px] font-medium text-muted-foreground">
                                    Các lựa chọn (phân tách bằng dấu phẩy)
                                  </div>
                                  <Input
                                    value={col.optionsText}
                                    onChange={(e) =>
                                      updateDraft(col.columnIndex, {
                                        optionsText: e.target.value,
                                      })
                                    }
                                    placeholder="Lựa chọn 1, Lựa chọn 2..."
                                    className="h-9"
                                  />
                                </div>
                              )}
                            </div>

                            <label className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                              <span>Bắt buộc nhập khi tạo lead</span>
                              <Checkbox
                                checked={col.required}
                                onCheckedChange={(c) =>
                                  updateDraft(col.columnIndex, {
                                    required: Boolean(c),
                                  })
                                }
                              />
                            </label>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              {/* ========================================================= */}
              {/* DESKTOP TABLE (>= 768px)                                  */}
              {/* ========================================================= */}
              <div className="hidden overflow-hidden rounded-lg border border-border md:block">
                <div className="max-h-[420px] overflow-auto">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="sticky top-0 z-10 border-b border-border bg-slate-100 text-[11px] font-semibold uppercase text-slate-600">
                      <tr>
                        <th className="w-10 px-3 py-2.5 text-center">
                          <Checkbox
                            checked={allSuggestedSelected}
                            onCheckedChange={(c) => toggleAllSuggested(Boolean(c))}
                            aria-label="Chọn tất cả cột đề xuất"
                          />
                        </th>
                        <th className="w-56 px-3 py-2.5">Cột gốc &amp; Dữ liệu mẫu</th>
                        <th className="w-56 px-3 py-2.5">Nhãn hiển thị &amp; Key</th>
                        <th className="w-64 px-3 py-2.5">Kiểu dữ liệu &amp; Tùy chọn</th>
                        <th className="w-24 px-3 py-2.5 text-center">Bắt buộc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border bg-white">
                      {visibleDrafts.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-3 py-8 text-center text-muted-foreground">
                            Không có cột nào trong nhóm này.
                          </td>
                        </tr>
                      ) : (
                        visibleDrafts.map((col) => {
                          const isDisabledStatus = col.status !== "suggested";
                          return (
                            <tr
                              key={col.columnIndex}
                              className={cn(
                                "align-top transition-colors",
                                !col.selected && "bg-slate-50/60 text-slate-500",
                              )}
                            >
                              <td className="px-3 py-3 text-center">
                                <Checkbox
                                  checked={col.selected}
                                  disabled={isDisabledStatus}
                                  onCheckedChange={(c) =>
                                    updateDraft(col.columnIndex, {
                                      selected: Boolean(c),
                                    })
                                  }
                                />
                              </td>

                              <td className="px-3 py-2.5">
                                <div className="flex items-center gap-1.5 font-semibold text-slate-800">
                                  <span className="font-mono text-[11px] text-slate-400">
                                    #{col.columnIndex}
                                  </span>
                                  <span>{col.rawHeader}</span>
                                </div>
                                {col.sampleValues.length > 0 ? (
                                  <div className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                                    Mẫu:{" "}
                                    <span className="italic text-slate-700">
                                      {col.sampleValues.slice(0, 3).join(" · ")}
                                    </span>
                                  </div>
                                ) : (
                                  <div className="mt-1 text-[11px] italic text-slate-400">
                                    (Cột trống trong các dòng đầu)
                                  </div>
                                )}
                                <div className="mt-1">
                                  {col.status === "core" && (
                                    <span className="inline-flex items-center gap-1 rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-700">
                                      <Layers className="size-2.5" />
                                      {col.statusNote}
                                    </span>
                                  )}
                                  {col.status === "existing" && (
                                    <span className="inline-flex items-center gap-1 rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700">
                                      <CheckCircle2 className="size-2.5" />
                                      {col.statusNote}
                                    </span>
                                  )}
                                  {col.status === "suggested" && (
                                    <span className="inline-flex items-center gap-1 text-[11px] text-slate-500">
                                      {col.statusNote}
                                    </span>
                                  )}
                                </div>
                              </td>

                              <td className="space-y-1.5 px-3 py-2.5">
                                <Input
                                  value={col.label}
                                  disabled={isDisabledStatus}
                                  onChange={(e) =>
                                    updateDraft(col.columnIndex, {
                                      label: e.target.value,
                                    })
                                  }
                                  placeholder="Nhãn hiển thị"
                                  className="h-8 text-xs font-medium"
                                />
                                <Input
                                  value={col.key}
                                  disabled={isDisabledStatus}
                                  onChange={(e) =>
                                    updateDraft(col.columnIndex, {
                                      key: e.target.value,
                                    })
                                  }
                                  placeholder="ma_key"
                                  className="h-7 font-mono text-[11px] text-slate-600"
                                />
                              </td>

                              <td className="space-y-1.5 px-3 py-2.5">
                                <Select
                                  value={col.fieldType}
                                  disabled={isDisabledStatus}
                                  onValueChange={(v) =>
                                    updateDraft(col.columnIndex, {
                                      fieldType: v as AttrFieldType,
                                    })
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {(
                                      Object.entries(TYPE_LABELS) as [
                                        AttrFieldType,
                                        string,
                                      ][]
                                    ).map(([value, label]) => (
                                      <SelectItem key={value} value={value}>
                                        {label}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>

                                {(col.fieldType === "select" ||
                                  col.fieldType === "multiselect") && (
                                  <Input
                                    value={col.optionsText}
                                    disabled={isDisabledStatus}
                                    onChange={(e) =>
                                      updateDraft(col.columnIndex, {
                                        optionsText: e.target.value,
                                      })
                                    }
                                    placeholder="Lựa chọn 1, Lựa chọn 2..."
                                    className="h-7 text-[11px]"
                                  />
                                )}
                              </td>

                              <td className="px-3 py-3 text-center">
                                <Checkbox
                                  checked={col.required}
                                  disabled={isDisabledStatus}
                                  onCheckedChange={(c) =>
                                    updateDraft(col.columnIndex, {
                                      required: Boolean(c),
                                    })
                                  }
                                />
                              </td>
                            </tr>
                          );
                        })
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>

        <DialogFooter className="shrink-0 border-t border-border bg-slate-50/70 px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))] sm:px-6">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={analyzing || saving}
            onClick={() => handleOpenChange(false)}
          >
            Đóng
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!report || selectedDrafts.length === 0 || analyzing || saving}
            onClick={handleSave}
            className="gap-1.5"
          >
            {saving ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
            {saving
              ? "Đang tạo field phụ..."
              : selectedDrafts.length > 0
                ? `Tạo ${selectedDrafts.length} field phụ đã chọn`
                : "Tạo field phụ"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
