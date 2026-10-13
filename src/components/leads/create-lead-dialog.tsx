"use client";

import * as React from "react";
import { Loader2, Plus, UserCheck } from "lucide-react";

import { createManualLeadAction } from "@/app/leads/actions";
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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { UserRole } from "@/lib/auth/roles";
import { DEFAULT_LEAD_CATALOG, type LeadCatalogOptions } from "@/lib/catalog";
import {
  CATEGORY_OPTIONS,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
} from "@/lib/constants";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { BrandCode, ChannelDetail, FailReason, Lead, LeadCategory } from "@/lib/types";

const NONE = "__NONE__";

interface CreateLeadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  assignees?: readonly string[];
  catalog?: LeadCatalogOptions;
  attrFields?: AttrFieldRow[];
  editor?: {
    role: UserRole;
    appUserId?: string | null;
    fullName?: string | null;
  };
  onCreated: (lead: Lead) => void;
}

export function CreateLeadDialog({
  open,
  onOpenChange,
  assignees = [],
  catalog = DEFAULT_LEAD_CATALOG,
  attrFields = [],
  editor,
  onCreated,
}: CreateLeadDialogProps) {
  const toast = useToast();
  const isStaff = editor?.role === "STAFF";
  const { labels } = catalog;
  const hasCustomEmail = attrFields.some((f) => f.key.toLowerCase() === "email");

  const [name, setName] = React.useState("");
  const [phone, setPhone] = React.useState("");
  const [email, setEmail] = React.useState("");
  const [brand, setBrand] = React.useState<BrandCode | null>(null);
  const [product, setProduct] = React.useState<string | null>(null);
  const [location, setLocation] = React.useState<string | null>(null);
  const [assignee, setAssignee] = React.useState<string | null>(null);
  const [channelDetail, setChannelDetail] = React.useState<ChannelDetail>("FORM");
  const [category, setCategory] = React.useState<LeadCategory>("CHUA_PHAN_LOAI");
  const [failReason, setFailReason] = React.useState<FailReason | null>(null);
  const [callbackAt, setCallbackAt] = React.useState("");
  const [careNote, setCareNote] = React.useState("");
  const [attrs, setAttrs] = React.useState<Record<string, string>>({});
  const [submitting, setSubmitting] = React.useState(false);

  const resetForm = React.useCallback(() => {
    setName("");
    setPhone("");
    setEmail("");
    setBrand(null);
    setProduct(null);
    setLocation(null);
    setAssignee(null);
    setChannelDetail("FORM");
    setCategory("CHUA_PHAN_LOAI");
    setFailReason(null);
    setCallbackAt("");
    setCareNote("");
    setAttrs({});
  }, []);

  const dirty =
    Boolean(name.trim()) ||
    Boolean(phone.trim()) ||
    Boolean(email.trim()) ||
    brand !== null ||
    product !== null ||
    location !== null ||
    assignee !== null ||
    channelDetail !== "FORM" ||
    category !== "CHUA_PHAN_LOAI" ||
    failReason !== null ||
    Boolean(callbackAt) ||
    Boolean(careNote.trim()) ||
    Object.values(attrs).some((v) => Boolean(v?.trim()));

  const handleOpenChange = (next: boolean) => {
    if (submitting) return;
    if (!next) {
      if (dirty && !window.confirm("Bạn đang nhập thông tin lead mới. Đóng và bỏ thông tin đã nhập?")) {
        return;
      }
      resetForm();
    }
    onOpenChange(next);
  };

  const products = (brand ? catalog.productsByBrand[brand] : undefined) ?? [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error("Thiếu thông tin", "Vui lòng nhập họ tên khách hàng.");
      return;
    }
    if (!phone.trim()) {
      toast.error("Thiếu thông tin", "Vui lòng nhập số điện thoại.");
      return;
    }
    for (const field of attrFields) {
      if (field.required && !(attrs[field.key] ?? "").trim()) {
        toast.error("Thiếu thông tin mở rộng", `Vui lòng nhập trường bắt buộc: ${field.label}.`);
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await createManualLeadAction({
        name: name.trim(),
        phone: phone.trim(),
        email: email.trim() || null,
        brand,
        product,
        location,
        assignee: isStaff ? null : assignee,
        channelDetail,
        category,
        failReason: category === "FAIL" ? failReason : null,
        callbackAt: callbackAt || null,
        careNote: careNote.trim() || null,
        attrs,
      });

      if (!res.ok) {
        toast.error("Không tạo được lead", res.error);
        return;
      }

      toast.success("Đã tạo lead thủ công", `${res.lead.name ?? ""} (${res.lead.phone})`);
      resetForm();
      onOpenChange(false);
      onCreated(res.lead);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[90vh] max-w-3xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
          <DialogTitle className="text-lg font-bold">Tạo lead thủ công</DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground">
            Nguồn mặc định là <strong>Thủ công</strong>.{" "}
            {isStaff
              ? "Tài khoản nhân viên sẽ tự động gán phụ trách là chính bạn."
              : "Tài khoản quản trị mặc định để trạng thái Chưa giao (hoặc có thể chọn nhân viên)."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="thin-scrollbar min-h-0 flex-1 space-y-5 overflow-y-auto p-6">
            {/* Thông tin định danh */}
            <div className="grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Họ tên khách hàng <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                  maxLength={120}
                  autoFocus
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-medium">
                  Số điện thoại <span className="text-rose-500">*</span>
                </Label>
                <Input
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="0901234567"
                  inputMode="tel"
                  className="tabular-nums"
                  required
                />
              </div>

              {!hasCustomEmail && (
                <div className="space-y-1.5">
                  <Label className="text-xs font-medium">Email</Label>
                  <Input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="khachhang@example.com"
                  />
                </div>
              )}
            </div>

            {/* Phụ trách & Phân bổ */}
            <div className="rounded-lg border border-border bg-slate-50/60 p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Phân bổ & Nguồn tiếp cận
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nguồn lead</Label>
                  <div className="flex h-8 items-center rounded-md border border-border bg-slate-100 px-3 text-xs font-semibold text-slate-700">
                    Thủ công
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Nhân viên phụ trách</Label>
                  {isStaff ? (
                    <div className="flex h-8 items-center gap-1.5 rounded-md border border-emerald-200 bg-emerald-50 px-3 text-xs font-medium text-emerald-800">
                      <UserCheck className="size-3.5 shrink-0" />
                      <span className="truncate">{editor?.fullName || "Tài khoản của bạn"}</span>
                    </div>
                  ) : (
                    <Select
                      value={assignee ?? NONE}
                      onValueChange={(v) => setAssignee(v === NONE ? null : v)}
                    >
                      <SelectTrigger size="sm" className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Chưa giao (Mặc định)</SelectItem>
                        {assignees.map((item) => (
                          <SelectItem key={item} value={item}>
                            {item}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Chi tiết kênh</Label>
                  <Select
                    value={channelDetail}
                    onValueChange={(v) => setChannelDetail(v as ChannelDetail)}
                  >
                    <SelectTrigger size="sm" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CHANNEL_DETAIL_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{labels.brand}</Label>
                  <Select
                    value={brand ?? NONE}
                    onValueChange={(v) => {
                      const next = v === NONE ? null : v;
                      setBrand(next);
                      setProduct(null);
                    }}
                  >
                    <SelectTrigger size="sm" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Chưa chọn</SelectItem>
                      {catalog.brands.map((b) => (
                        <SelectItem key={b.code} value={b.code}>
                          {b.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{labels.product}</Label>
                  <Select
                    value={product ?? NONE}
                    onValueChange={(v) => setProduct(v === NONE ? null : v)}
                    disabled={!brand}
                  >
                    <SelectTrigger size="sm" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>
                        {brand ? "Chưa chọn" : `Chọn ${labels.brand.toLowerCase()} trước`}
                      </SelectItem>
                      {products.map((p) => (
                        <SelectItem key={p} value={p}>
                          {p}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{labels.location}</Label>
                  <Select
                    value={location ?? NONE}
                    onValueChange={(v) => setLocation(v === NONE ? null : v)}
                  >
                    <SelectTrigger size="sm" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>Chưa phân bổ</SelectItem>
                      {catalog.locations.map((loc) => (
                        <SelectItem key={loc} value={loc}>
                          {loc}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Phân loại</Label>
                  <Select
                    value={category}
                    onValueChange={(v) => setCategory(v as LeadCategory)}
                  >
                    <SelectTrigger size="sm" className="w-full bg-white">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="CHUA_PHAN_LOAI">Chưa phân loại</SelectItem>
                      {CATEGORY_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {category === "FAIL" && (
                  <div className="space-y-1.5">
                    <Label className="text-xs text-muted-foreground">Lý do loại</Label>
                    <Select
                      value={failReason ?? NONE}
                      onValueChange={(v) => setFailReason(v === NONE ? null : (v as FailReason))}
                    >
                      <SelectTrigger size="sm" className="w-full bg-white">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value={NONE}>Chọn lý do loại</SelectItem>
                        {FAIL_REASON_OPTIONS.map((o) => (
                          <SelectItem key={o.value} value={o.value}>
                            {o.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                )}

                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">Hẹn gọi lại</Label>
                  <Input
                    type="datetime-local"
                    value={callbackAt}
                    onChange={(e) => setCallbackAt(e.target.value)}
                    className="h-8 bg-white"
                  />
                </div>
              </div>
            </div>

            {/* Field phụ cấu hình thêm */}
            {attrFields.length > 0 && (
              <div className="rounded-lg border border-border bg-slate-50/60 p-4">
                <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Thông tin mở rộng ({attrFields.length})
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {attrFields.map((field) => {
                    const value = attrs[field.key] ?? "";
                    const setVal = (next: string) =>
                      setAttrs((prev) => ({ ...prev, [field.key]: next }));
                    return (
                      <div key={field.id} className="space-y-1.5">
                        <Label className="text-xs text-muted-foreground">
                          {field.label}
                          {field.required && <span className="ml-0.5 text-rose-500">*</span>}
                        </Label>
                        {field.fieldType === "select" ? (
                          <Select
                            value={value || NONE}
                            onValueChange={(v) => setVal(v === NONE ? "" : v)}
                          >
                            <SelectTrigger size="sm" className="w-full bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Chưa chọn</SelectItem>
                              {field.options.map((opt) => (
                                <SelectItem key={opt} value={opt}>
                                  {opt}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        ) : field.fieldType === "multiselect" ? (
                          <MultiSelect
                            options={field.options.map((opt) => ({ value: opt, label: opt }))}
                            selected={value
                              .split(",")
                              .map((s) => s.trim())
                              .filter(Boolean)}
                            onChange={(next) => setVal(next.join(", "))}
                            placeholder="Chưa chọn"
                            className="w-full justify-between bg-white"
                          />
                        ) : field.fieldType === "boolean" ? (
                          <Select
                            value={value || NONE}
                            onValueChange={(v) => setVal(v === NONE ? "" : v)}
                          >
                            <SelectTrigger size="sm" className="w-full bg-white">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>Chưa chọn</SelectItem>
                              <SelectItem value="true">Có</SelectItem>
                              <SelectItem value="false">Không</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <Input
                            type={
                              field.fieldType === "number"
                                ? "number"
                                : field.fieldType === "date"
                                  ? "date"
                                  : "text"
                            }
                            value={value}
                            onChange={(e) => setVal(e.target.value)}
                            className="h-8 bg-white"
                            placeholder={field.required ? "Bắt buộc" : "Chưa nhập"}
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Ghi chú chăm sóc */}
            <div className="space-y-1.5">
              <Label className="text-xs font-medium">Ghi chú ban đầu</Label>
              <Textarea
                rows={3}
                value={careNote}
                onChange={(e) => setCareNote(e.target.value)}
                placeholder="Ghi chú nhu cầu, thời gian khách muốn nhận cuộc gọi..."
              />
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-slate-50/70 px-6 py-3">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={submitting}
              onClick={() => handleOpenChange(false)}
            >
              Hủy
            </Button>
            <Button type="submit" size="sm" disabled={submitting} className="gap-1.5">
              {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />}
              Tạo lead
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
