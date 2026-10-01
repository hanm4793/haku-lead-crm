"use client";

import * as React from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createAttrFieldAction,
  deleteAttrFieldAction,
  setAttrFieldActiveAction,
  type AttrFieldActionResult,
} from "@/app/settings/attr-field-actions";
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
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AttrFieldRow, AttrFieldType } from "@/lib/db/attr-fields-repo";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<AttrFieldType, { label: string; color: string }> = {
  text: { label: "Văn bản", color: "bg-slate-100 text-slate-700 border-slate-200" },
  number: { label: "Số", color: "bg-blue-50 text-blue-700 border-blue-200" },
  select: { label: "Chọn một", color: "bg-purple-50 text-purple-700 border-purple-200" },
  date: { label: "Ngày tháng", color: "bg-amber-50 text-amber-700 border-amber-200" },
};

export function AttrFieldsPanel({
  fields,
  isAdmin,
  dbConfigured,
  projectId,
}: {
  fields: AttrFieldRow[];
  isAdmin: boolean;
  dbConfigured: boolean;
  projectId?: string;
}) {
  const scope = React.useMemo(() => (projectId ? { projectId } : {}), [projectId]);
  const router = useRouter();

  const [query, setQuery] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
  const [label, setLabel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [fieldType, setFieldType] = React.useState<AttrFieldType>("text");
  const [optionsCsv, setOptionsCsv] = React.useState("");
  const [required, setRequired] = React.useState(false);

  const [deleteConfirm, setDeleteConfirm] = React.useState<AttrFieldRow | null>(null);

  const run = async (action: () => Promise<AttrFieldActionResult>) => {
    setPending(true);
    setError(null);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setError(outcome.error);
        return false;
      }
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  if (!dbConfigured) {
    return <p className="text-xs text-amber-800">Cần DATABASE_URL và project để quản lý field phụ.</p>;
  }

  const filtered = fields.filter((f) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center justify-between rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-800">
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <X className="size-4" />
          </button>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[220px] max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm theo nhãn hoặc key…"
            className="h-8.5 pl-8 text-[12.5px]"
          />
        </div>

        {isAdmin && (
          <Button
            size="sm"
            onClick={() => {
              setLabel("");
              setKey("");
              setFieldType("text");
              setOptionsCsv("");
              setRequired(false);
              setCreateDialogOpen(true);
            }}
            className="gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Thêm field phụ</span>
          </Button>
        )}
      </div>

      {/* Data Table */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border/80 bg-slate-50/80 text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="py-2.5 pl-4 pr-3 w-14">#</th>
                <th className="px-3 py-2.5">Nhãn hiển thị</th>
                <th className="px-3 py-2.5">Mã thuộc tính (Key)</th>
                <th className="px-3 py-2.5">Kiểu dữ liệu</th>
                <th className="px-3 py-2.5">Bắt buộc</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                {isAdmin && <th className="py-2.5 pl-3 pr-4 text-right">Thao tác</th>}
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-muted-foreground text-[12.5px]">
                    Không có field phụ nào phù hợp.
                  </td>
                </tr>
              ) : (
                filtered.map((field, idx) => {
                  const typeMeta = TYPE_LABELS[field.fieldType];
                  return (
                    <tr key={field.id} className="hover:bg-slate-50/60 transition-colors">
                      <td className="py-3 pl-4 pr-3 text-muted-foreground text-[12px] font-mono">
                        {idx + 1}
                      </td>
                      <td className="px-3 py-3 font-semibold text-slate-900">{field.label}</td>
                      <td className="px-3 py-3 font-mono text-[12px] text-slate-600">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5">{field.key}</span>
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex items-center rounded-md border px-2 py-0.5 text-[11px] font-medium",
                            typeMeta.color,
                          )}
                        >
                          {typeMeta.label}
                        </span>
                        {field.fieldType === "select" && field.options.length > 0 && (
                          <div className="mt-1 text-[11px] text-muted-foreground truncate max-w-xs">
                            Lựa chọn: {field.options.join(", ")}
                          </div>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        {field.required ? (
                          <Badge variant="danger" className="text-[10.5px]">
                            Bắt buộc
                          </Badge>
                        ) : (
                          <span className="text-[12px] text-muted-foreground">Tùy chọn</span>
                        )}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <Switch
                            checked={field.active}
                            disabled={!isAdmin || pending}
                            onCheckedChange={(active) =>
                              run(() => setAttrFieldActiveAction({ ...scope, id: field.id, active }))
                            }
                          />
                          <span
                            className={cn(
                              "text-[11.5px] font-medium",
                              field.active ? "text-emerald-700" : "text-muted-foreground",
                            )}
                          >
                            {field.active ? "Đang bật" : "Đang tắt"}
                          </span>
                        </div>
                      </td>
                      {isAdmin && (
                        <td className="py-3 pl-3 pr-4 text-right">
                          <Button
                            variant="ghost"
                            size="iconSm"
                            title="Xóa field phụ"
                            onClick={() => setDeleteConfirm(field)}
                          >
                            <Trash2 className="size-3.5 text-slate-400 hover:text-rose-600" />
                          </Button>
                        </td>
                      )}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog Thêm Field Phụ */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Thêm field phụ mới</DialogTitle>
            <DialogDescription>
              Tạo trường thông tin tùy chỉnh cho các khách hàng của dự án này.
            </DialogDescription>
          </DialogHeader>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              void run(() =>
                createAttrFieldAction({
                  ...scope,
                  label,
                  key: key.trim() || undefined,
                  fieldType,
                  optionsCsv: fieldType === "select" ? optionsCsv : undefined,
                  required,
                }),
              ).then((ok) => {
                if (ok) setCreateDialogOpen(false);
              });
            }}
            className="space-y-3.5 py-2"
          >
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Nhãn hiển thị <span className="text-rose-600">*</span>
              </Label>
              <Input
                value={label}
                onChange={(e) => setLabel(e.target.value)}
                placeholder="VD: Số khung, Ngân sách, Diện tích..."
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Mã thuộc tính (Key)</Label>
              <Input
                value={key}
                onChange={(e) => setKey(e.target.value)}
                placeholder="VD: so_khung, ngan_sach (tự sinh nếu để trống)"
                className="font-mono text-[13px]"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">Kiểu dữ liệu</Label>
              <Select value={fieldType} onValueChange={(v) => setFieldType(v as AttrFieldType)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Văn bản (Text)</SelectItem>
                  <SelectItem value="number">Số (Number)</SelectItem>
                  <SelectItem value="select">Danh sách chọn một (Select)</SelectItem>
                  <SelectItem value="date">Ngày tháng (Date)</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {fieldType === "select" && (
              <div className="space-y-1.5">
                <Label className="text-[13px]">
                  Các lựa chọn (phân cách bằng dấu phẩy) <span className="text-rose-600">*</span>
                </Label>
                <Input
                  value={optionsCsv}
                  onChange={(e) => setOptionsCsv(e.target.value)}
                  placeholder="VD: Dưới 1 tỷ, 1 - 2 tỷ, Trên 2 tỷ"
                  required
                />
              </div>
            )}

            <div className="flex items-center gap-2 pt-1">
              <Checkbox
                id="req"
                checked={required}
                onCheckedChange={(c) => setRequired(Boolean(c))}
              />
              <Label htmlFor="req" className="text-[13px] font-normal cursor-pointer">
                Bắt buộc điền khi nhập hồ sơ lead
              </Label>
            </div>

            <DialogFooter className="pt-2">
              <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
                Hủy
              </Button>
              <Button type="submit" disabled={pending || !label.trim()}>
                Thêm field
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Dialog Xác nhận Xóa */}
      <Dialog
        open={Boolean(deleteConfirm)}
        onOpenChange={(open) => !open && setDeleteConfirm(null)}
      >
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-rose-600">Xác nhận xóa field phụ</DialogTitle>
            <DialogDescription>
              Bạn có chắc chắn muốn xóa trường <strong>«{deleteConfirm?.label}»</strong> không?
            </DialogDescription>
          </DialogHeader>

          <p className="text-[12px] text-muted-foreground bg-slate-50 p-2.5 rounded-lg border border-border/80">
            ⚠️ Xóa field phụ sẽ không hiển thị trường này trong form lead nữa. Nếu chỉ muốn tạm dừng,
            hãy chọn <strong>Tắt</strong> thay vì xóa.
          </p>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDeleteConfirm(null)}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={async () => {
                if (!deleteConfirm) return;
                const ok = await run(() =>
                  deleteAttrFieldAction({ ...scope, id: deleteConfirm.id }),
                );
                if (ok) setDeleteConfirm(null);
              }}
            >
              Xác nhận xóa
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
