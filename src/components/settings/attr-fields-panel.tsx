"use client";

import * as React from "react";
import { Plus } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  createAttrFieldAction,
  deleteAttrFieldAction,
  setAttrFieldActiveAction,
  updateAttrFieldAction,
  type AttrFieldActionResult,
} from "@/app/settings/attr-field-actions";
import { ConfirmDialog, FormDialog, FormField, RowActions } from "@/components/common/crud-dialogs";
import { DataTable, ListPanel, type DataColumn } from "@/components/common/data-table";
import {
  ActiveSwitch,
  FilterSelect,
  ListToolbar,
  matchesStatus,
  STATUS_FILTER_OPTIONS,
} from "@/components/common/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AttrFieldRow, AttrFieldType } from "@/lib/db/attr-fields-repo";
import { useToast } from "@/components/providers/toast-provider";

const TYPE_LABELS: Record<AttrFieldType, string> = {
  text: "Văn bản",
  number: "Số",
  select: "Chọn một",
  date: "Ngày tháng",
};

const TYPE_FILTER = [
  { value: "all", label: "Mọi kiểu dữ liệu" },
  ...(Object.entries(TYPE_LABELS) as [AttrFieldType, string][]).map(([value, label]) => ({ value, label })),
];

type FormState = { label: string; key: string; fieldType: AttrFieldType; optionsCsv: string; required: boolean };
const EMPTY_FORM: FormState = { label: "", key: "", fieldType: "text", optionsCsv: "", required: false };

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
  const toast = useToast();

  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [typeFilter, setTypeFilter] = React.useState("all");
  const [pending, setPending] = React.useState(false);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<AttrFieldRow | null>(null);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [deleting, setDeleting] = React.useState<AttrFieldRow | null>(null);

  const run = async (action: () => Promise<AttrFieldActionResult>, success: string) => {
    setPending(true);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        toast.error("Không thực hiện được", outcome.error);
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  const openCreate = () => {
    setEditing(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (field: AttrFieldRow) => {
    setEditing(field);
    setForm({
      label: field.label,
      key: field.key,
      fieldType: field.fieldType,
      optionsCsv: field.options.join(", "),
      required: field.required,
    });
    setDialogOpen(true);
  };

  const submit = async () => {
    const optionsCsv = form.fieldType === "select" ? form.optionsCsv : undefined;
    const ok = await run(
      () =>
        editing
          ? updateAttrFieldAction({
              ...scope,
              id: editing.id,
              label: form.label,
              fieldType: form.fieldType,
              optionsCsv,
              required: form.required,
            })
          : createAttrFieldAction({
              ...scope,
              label: form.label,
              key: form.key.trim() || undefined,
              fieldType: form.fieldType,
              optionsCsv,
              required: form.required,
            }),
      editing ? `Đã cập nhật field «${form.label.trim()}».` : `Đã thêm field «${form.label.trim()}».`,
    );
    if (ok) setDialogOpen(false);
  };

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return fields.filter(
      (f) =>
        matchesStatus(status, f.active) &&
        (typeFilter === "all" || f.fieldType === typeFilter) &&
        (!q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)),
    );
  }, [fields, query, status, typeFilter]);

  const columns: DataColumn<AttrFieldRow>[] = [
    { id: "label", header: "Nhãn hiển thị", sortValue: (f) => f.label, cell: (f) => <span className="font-semibold text-slate-800">{f.label}</span> },
    {
      id: "key",
      header: "Key",
      sortValue: (f) => f.key,
      cell: (f) => <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-600">{f.key}</span>,
    },
    {
      id: "type",
      header: "Kiểu dữ liệu",
      sortValue: (f) => TYPE_LABELS[f.fieldType],
      cell: (f) => (
        <div>
          <Badge variant="info">{TYPE_LABELS[f.fieldType]}</Badge>
          {f.fieldType === "select" && f.options.length > 0 && (
            <div className="mt-1 max-w-xs truncate text-[11px] text-muted-foreground" title={f.options.join(", ")}>
              {f.options.join(", ")}
            </div>
          )}
        </div>
      ),
    },
    {
      id: "required",
      header: "Bắt buộc",
      sortValue: (f) => f.required,
      cell: (f) => (f.required ? <Badge variant="danger">Bắt buộc</Badge> : <span className="text-muted-foreground">Tùy chọn</span>),
    },
    {
      id: "active",
      header: "Trạng thái",
      sortValue: (f) => f.active,
      cell: (f) => (
        <ActiveSwitch
          checked={f.active}
          disabled={!isAdmin || pending}
          onChange={(active) => void run(() => setAttrFieldActiveAction({ ...scope, id: f.id, active }), "Đã cập nhật trạng thái.")}
        />
      ),
    },
    ...(isAdmin
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: 90,
            cell: (f: AttrFieldRow) => (
              <RowActions editTitle="Sửa field phụ" deleteTitle="Xóa field phụ" onEdit={() => openEdit(f)} onDelete={() => setDeleting(f)} />
            ),
          },
        ]
      : []),
  ];

  if (!dbConfigured) {
    return <p className="text-xs text-amber-800">Cần DATABASE_URL và project để quản lý field phụ.</p>;
  }

  return (
    <div className="space-y-3">
      <ListPanel
        toolbar={
          <ListToolbar
            search={{ value: query, onChange: setQuery, placeholder: "Tìm nhãn / key" }}
            filters={
              <>
                <FilterSelect value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
                <FilterSelect value={typeFilter} onChange={setTypeFilter} options={TYPE_FILTER} />
              </>
            }
            actions={
              isAdmin && (
                <Button size="sm" className="gap-1.5" onClick={openCreate}>
                  <Plus className="size-3.5" />
                  Thêm field phụ
                </Button>
              )
            }
          />
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(f) => f.id}
          onRowClick={isAdmin ? openEdit : undefined}
          unit="field"
          emptyMessage="Không có field phụ nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Sửa field phụ" : "Thêm field phụ"}
        description="Trường thông tin tùy chỉnh cho lead của dự án này."
        submitLabel={editing ? "Lưu thay đổi" : "Thêm field"}
        pending={pending}
        disabled={!form.label.trim() || (form.fieldType === "select" && !form.optionsCsv.trim())}
        onSubmit={() => void submit()}
      >
        <FormField label="Nhãn hiển thị" required>
          <Input
            value={form.label}
            onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
            placeholder="VD: Số khung, Ngân sách, Diện tích…"
            autoFocus
          />
        </FormField>
        <FormField label="Key" hint={editing ? "Key không đổi được sau khi tạo." : "Tự sinh từ nhãn nếu để trống."}>
          <Input
            value={form.key}
            onChange={(e) => setForm((f) => ({ ...f, key: e.target.value }))}
            placeholder="VD: so_khung"
            className="font-mono text-[13px]"
            disabled={Boolean(editing)}
          />
        </FormField>
        <FormField label="Kiểu dữ liệu">
          <Select value={form.fieldType} onValueChange={(v) => setForm((f) => ({ ...f, fieldType: v as AttrFieldType }))}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(TYPE_LABELS) as [AttrFieldType, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        {form.fieldType === "select" && (
          <FormField label="Các lựa chọn" required hint="Phân cách bằng dấu phẩy.">
            <Input
              value={form.optionsCsv}
              onChange={(e) => setForm((f) => ({ ...f, optionsCsv: e.target.value }))}
              placeholder="VD: Dưới 1 tỷ, 1 - 2 tỷ, Trên 2 tỷ"
            />
          </FormField>
        )}
        <div className="flex items-center gap-2">
          <Checkbox
            id="attr-required"
            checked={form.required}
            onCheckedChange={(c) => setForm((f) => ({ ...f, required: Boolean(c) }))}
          />
          <Label htmlFor="attr-required" className="cursor-pointer text-[13px] font-normal">
            Bắt buộc điền khi nhập hồ sơ lead
          </Label>
        </div>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Xác nhận xóa field phụ"
        description={
          <>
            Bạn có chắc muốn xóa <strong>«{deleting?.label}»</strong>?
          </>
        }
        note="Field bị xóa sẽ không còn hiện trong form lead. Nếu chỉ muốn tạm dừng, hãy chọn Tắt."
        pending={pending}
        onConfirm={async () => {
          if (!deleting) return;
          await run(() => deleteAttrFieldAction({ ...scope, id: deleting.id }), `Đã xóa field «${deleting.label}».`);
          setDeleting(null);
        }}
      />
    </div>
  );
}
