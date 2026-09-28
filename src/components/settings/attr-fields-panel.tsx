"use client";

import * as React from "react";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import type { AttrFieldRow, AttrFieldType } from "@/lib/db/attr-fields-repo";
import { cn } from "@/lib/utils";

const TYPE_LABELS: Record<AttrFieldType, string> = {
  text: "Văn bản",
  number: "Số",
  select: "Chọn một",
  date: "Ngày",
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
  const scope = projectId ? { projectId } : {};
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [feedback, setFeedback] = React.useState<string | null>(null);

  const [label, setLabel] = React.useState("");
  const [key, setKey] = React.useState("");
  const [fieldType, setFieldType] = React.useState<AttrFieldType>("text");
  const [optionsCsv, setOptionsCsv] = React.useState("");
  const [required, setRequired] = React.useState(false);

  const run = async (action: () => Promise<AttrFieldActionResult>, done: string) => {
    setPending(true);
    setError(null);
    setFeedback(null);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        setError(outcome.error);
        return false;
      }
      setFeedback(done);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };

  if (!dbConfigured) {
    return <p className="text-xs text-amber-800">Cần DATABASE_URL và project để quản lý field phụ.</p>;
  }

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        Field phụ hiển thị trên chi tiết lead và lưu trong <code className="rounded bg-secondary px-1">attrs</code>.
        Key tự sinh từ nhãn nếu để trống.
      </p>

      <ul className="space-y-1.5">
        {fields.map((field) => (
          <li
            key={field.id}
            className={cn(
              "flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-card px-2 py-1.5 text-[13px]",
              !field.active && "opacity-60",
            )}
          >
            <div className="min-w-0">
              <span className="font-medium text-slate-800">{field.label}</span>
              <span className="ml-2 font-mono text-[11px] text-muted-foreground">{field.key}</span>
              <Badge variant="outline" className="ml-2 text-[10px]">
                {TYPE_LABELS[field.fieldType]}
              </Badge>
              {field.required && (
                <Badge variant="muted" className="ml-1 text-[10px]">
                  Bắt buộc
                </Badge>
              )}
            </div>
            {isAdmin ? (
              <div className="flex items-center gap-2">
                <Switch
                  checked={field.active}
                  disabled={pending}
                  onCheckedChange={(active) =>
                    void run(
                      () => setAttrFieldActiveAction({ ...scope, id: field.id, active }),
                      `Đã ${active ? "bật" : "tắt"} ${field.label}.`,
                    )
                  }
                />
                <Button
                  type="button"
                  size="xs"
                  variant="ghost"
                  disabled={pending}
                  onClick={() =>
                    void run(() => deleteAttrFieldAction({ ...scope, id: field.id }), `Đã xóa ${field.label}.`)
                  }
                >
                  Xóa
                </Button>
              </div>
            ) : (
              <Badge variant={field.active ? "success" : "muted"}>{field.active ? "Bật" : "Tắt"}</Badge>
            )}
          </li>
        ))}
        {fields.length === 0 && <li className="text-xs text-muted-foreground">Chưa có field phụ nào.</li>}
      </ul>

      {isAdmin && (
        <form
          className="space-y-3 rounded-lg border border-dashed border-border p-3"
          onSubmit={(e) => {
            e.preventDefault();
            void run(
              () =>
                createAttrFieldAction({
                  ...scope,
                  label,
                  key: key.trim() || undefined,
                  fieldType,
                  optionsCsv: fieldType === "select" ? optionsCsv : undefined,
                  required,
                }),
              `Đã thêm ${label}.`,
            ).then((ok) => {
              if (ok) {
                setLabel("");
                setKey("");
                setFieldType("text");
                setOptionsCsv("");
                setRequired(false);
              }
            });
          }}
        >
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Thêm field</div>
          <div className="flex flex-wrap gap-2">
            <Input
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="Nhãn hiển thị"
              className="h-8 max-w-[200px]"
              required
            />
            <Input
              value={key}
              onChange={(e) => setKey(e.target.value)}
              placeholder="Key (tùy chọn)"
              className="h-8 max-w-[160px] font-mono text-[12px]"
            />
            <Select value={fieldType} onValueChange={(v) => setFieldType(v as AttrFieldType)}>
              <SelectTrigger className="h-8 w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(TYPE_LABELS) as AttrFieldType[]).map((t) => (
                  <SelectItem key={t} value={t}>
                    {TYPE_LABELS[t]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {fieldType === "select" && (
            <Input
              value={optionsCsv}
              onChange={(e) => setOptionsCsv(e.target.value)}
              placeholder="Lựa chọn, phân tách bằng dấu phẩy"
              className="h-8"
            />
          )}
          <div className="flex items-center gap-2">
            <Checkbox id="attr-required" checked={required} onCheckedChange={(v) => setRequired(v === true)} />
            <Label htmlFor="attr-required" className="text-[13px] font-normal">
              Bắt buộc khi sửa lead
            </Label>
          </div>
          <Button type="submit" size="sm" variant="outline" disabled={pending || !label.trim()}>
            Thêm field
          </Button>
        </form>
      )}

      {error && (
        <p className="text-xs text-rose-700" role="alert">
          {error}
        </p>
      )}
      {feedback && (
        <p className="text-xs text-emerald-800" role="status">
          {feedback}
        </p>
      )}
      {!isAdmin && <p className="text-xs text-muted-foreground">Chỉ super admin mới sửa field phụ.</p>}
    </div>
  );
}
