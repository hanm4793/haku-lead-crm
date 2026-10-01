"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Check,
  Copy,
  Lightbulb,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  PhoneMissed,
  Save,
  Sparkles,
  StickyNote,
  UserCog,
  Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { DEFAULT_LEAD_CATALOG, type LeadCatalogOptions } from "@/lib/catalog";
import {
  ASSIGNEES,
  UNASSIGNED_ASSIGNMENT_LABEL,
  CATEGORY_LONG_LABEL,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type {
  ActivityKind,
  ActivityLog,
  BrandCode,
  ChannelDetail,
  FailReason,
  Lead,
  LeadCategory,
  LeadSource,
} from "@/lib/types";
import { cn, formatDateTime, toDateInputValue } from "@/lib/utils";

const CATEGORY_VALUES: LeadCategory[] = ["CHUA_PHAN_LOAI", "KHQT", "GDTD", "KHD", "CHUA_LH_DUOC", "FAIL"];

/** Sentinel cho "chưa chọn" — Radix Select không nhận value rỗng. */
const NONE = "__NONE__";

interface DraftState {
  source: LeadSource;
  channelDetail: ChannelDetail;
  assignee: string | null;
  category: LeadCategory;
  failReason: FailReason | null;
  brand: BrandCode | null;
  product: string | null;
  /** Tên location; null = chưa phân bổ. */
  location: string | null;
  careNote: string;
  callbackAt: string;
}

function locationOf(lead: Lead): string | null {
  const name = lead.location?.trim();
  return name && name !== UNASSIGNED_ASSIGNMENT_LABEL ? name : null;
}

function toDraft(lead: Lead): DraftState {
  return {
    source: lead.source,
    channelDetail: lead.channelDetail,
    assignee: lead.assignee,
    category: lead.category,
    failReason: lead.failReason,
    brand: lead.brand,
    product: lead.product,
    location: locationOf(lead),
    careNote: lead.careNote ?? "",
    callbackAt: toDateInputValue(lead.callbackAt),
  };
}

interface LeadDetailDialogProps {
  lead: Lead | null;
  logs: ActivityLog[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<Lead>, logs: { kind: ActivityKind; message: string; byAi?: boolean }[]) => void;
  readOnly?: boolean;
  assignees?: readonly string[];
  /** Danh mục brand / sản phẩm / location và nhãn theo project. */
  catalog?: LeadCatalogOptions;
  /** Định nghĩa field phụ (active) của project. */
  attrFields?: AttrFieldRow[];
}

export function LeadDetailDialog({ lead, ...props }: LeadDetailDialogProps) {
  if (!lead) return null;
  // key theo lead.id để form tự khởi tạo lại khi mở sang khách khác.
  return <LeadDetailDialogBody key={lead.id} lead={lead} {...props} />;
}

function LeadDetailDialogBody({
  lead,
  logs,
  open,
  onOpenChange,
  onSave,
  readOnly = false,
  assignees = ASSIGNEES,
  catalog = DEFAULT_LEAD_CATALOG,
  attrFields = [],
}: LeadDetailDialogProps & { lead: Lead }) {
  const [draft, setDraft] = React.useState<DraftState>(() => toDraft(lead));
  const [attrDraft, setAttrDraft] = React.useState<Record<string, string>>(() => ({ ...(lead.attrs ?? {}) }));
  const [prevAttrs, setPrevAttrs] = React.useState(lead.attrs);
  if (lead.attrs !== prevAttrs) {
    setPrevAttrs(lead.attrs);
    setAttrDraft({ ...(lead.attrs ?? {}) });
  }
  const [justSaved, setJustSaved] = React.useState(false);
  const [aiLoading, setAiLoading] = React.useState<"summarize" | "suggest_action" | "polish_note" | null>(null);
  const [aiResult, setAiResult] = React.useState<{ type: "summarize" | "suggest_action" | "polish_note"; text: string } | null>(null);
  const [copied, setCopied] = React.useState(false);
  const [aiPolishedNoteUsed, setAiPolishedNoteUsed] = React.useState(false);
  const { labels } = catalog;

  const patch = (next: Partial<DraftState>) => {
    setDraft((d) => ({ ...d, ...next }));
    setJustSaved(false);
  };

  const callCopilot = async (action: "summarize" | "suggest_action" | "polish_note") => {
    setAiLoading(action);
    setCopied(false);
    try {
      const res = await fetch("/api/ai/lead-copilot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          leadId: lead.id,
          action,
          draftNote: draft.careNote,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        setAiResult({ type: action, text: data.error ?? "Không thể xử lý lúc này." });
      } else {
        setAiResult({ type: action, text: data.result });
      }
    } catch {
      setAiResult({ type: action, text: "Lỗi kết nối tới trợ lý AI." });
    } finally {
      setAiLoading(null);
    }
  };

  const dirty =
    draft.source !== lead.source ||
    draft.channelDetail !== lead.channelDetail ||
    draft.assignee !== lead.assignee ||
    draft.category !== lead.category ||
    draft.failReason !== lead.failReason ||
    draft.brand !== lead.brand ||
    draft.product !== lead.product ||
    draft.location !== locationOf(lead) ||
    draft.careNote !== (lead.careNote ?? "") ||
    draft.callbackAt !== toDateInputValue(lead.callbackAt) ||
    attrsDirty(attrFields, attrDraft, lead.attrs ?? {});

  const handleSave = () => {
    const entries: { kind: ActivityKind; message: string; byAi?: boolean }[] = [];
    if (draft.category !== lead.category) {
      entries.push({
        kind: "CATEGORY_CHANGE",
        message: `Cập nhật phân loại: ${CATEGORY_LONG_LABEL[lead.category]} → ${CATEGORY_LONG_LABEL[draft.category]}.`,
      });
    }
    if (draft.assignee !== lead.assignee) {
      entries.push({
        kind: "ASSIGN_CHANGE",
        message: `Đổi người phụ trách: ${lead.assignee ?? "Chưa giao"} → ${draft.assignee ?? "Chưa giao"}.`,
      });
    }
    if (draft.careNote && draft.careNote !== (lead.careNote ?? "")) {
      entries.push({
        kind: "NOTE",
        message: draft.careNote,
        byAi: aiPolishedNoteUsed,
      });
    }

    const savePatch: Partial<Lead> & { attrs?: Record<string, string> } = {
        source: draft.source,
        channelDetail: draft.channelDetail,
        assignee: draft.assignee,
        category: draft.category,
        failReason: draft.category === "FAIL" ? draft.failReason : null,
        brand: draft.brand,
        product: draft.product,
        // Lead.location là chuỗi hiển thị; server đổi nhãn "Chưa phân bổ" về null.
        location: draft.location ?? UNASSIGNED_ASSIGNMENT_LABEL,
        careNote: draft.careNote || null,
        callbackAt: draft.callbackAt ? new Date(draft.callbackAt).toISOString() : null,
        contactStatus: draft.careNote ? "DA_LIEN_HE" : lead.contactStatus,
    };
    if (attrFields.length > 0) {
      const attrsPatch: Record<string, string> = {};
      for (const field of attrFields) {
        attrsPatch[field.key] = attrDraft[field.key] ?? "";
      }
      savePatch.attrs = attrsPatch;
    }
    onSave(savePatch, entries);
    setJustSaved(true);
  };

  const products = (draft.brand ? catalog.productsByBrand[draft.brand] : undefined) ?? [];
  // Lead cũ có thể trỏ tới giá trị đã tắt / không còn trong danh mục — vẫn cho hiện để không mất dữ liệu.
  const brandOptions = withCurrent(
    catalog.brands.map((b) => ({ value: b.code, label: b.name })),
    draft.brand,
  );
  const productOptions = withCurrent(
    products.map((p) => ({ value: p, label: p })),
    draft.product,
  );
  const locationOptions = withCurrent(
    catalog.locations.map((l) => ({ value: l, label: l })),
    draft.location,
  );
  const defKeys = new Set(attrFields.map((f) => f.key));
  const leftoverAttrs = Object.entries(lead.attrs ?? {}).filter(([key]) => !defKeys.has(key));

  const patchAttr = (key: string, value: string) => {
    setAttrDraft((prev) => ({ ...prev, [key]: value }));
    setJustSaved(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92vh] max-w-4xl gap-0 overflow-hidden p-0">
        <div className="border-b border-border px-6 pb-4 pt-5">
          <DialogTitle className="flex items-center gap-2 text-xl font-bold">
            {lead.name ?? "Khách chưa có tên"}
            <button type="button" title="Sửa tên khách" className="text-slate-400 transition-colors hover:text-primary">
              <Pencil className="size-4" />
            </button>
          </DialogTitle>
          <DialogDescription asChild>
            <div className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
              <span className="tabular-nums">{lead.phone}</span>
              <button
                type="button"
                onClick={() => navigator.clipboard?.writeText(lead.phone)}
                title="Sao chép số"
                className="transition-colors hover:text-primary"
              >
                <Copy className="size-3.5" />
              </button>
              <a
                href={`https://zalo.me/${lead.phone}`}
                target="_blank"
                rel="noreferrer"
                title="Nhắn Zalo"
                className="transition-colors hover:text-primary"
              >
                <MessageSquare className="size-3.5" />
              </a>
            </div>
          </DialogDescription>
        </div>

        <fieldset disabled={readOnly} className="min-w-0 border-0 p-0">
        <div className="thin-scrollbar grid max-h-[62vh] gap-5 overflow-y-auto p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-lg bg-[#f7f9fc] p-4">
              <dl className="space-y-2.5 text-sm">
                <RowControl label={labels.location}>
                  <Select
                    value={draft.location ?? NONE}
                    onValueChange={(v) => patch({ location: v === NONE ? null : v })}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{UNASSIGNED_ASSIGNMENT_LABEL}</SelectItem>
                      {locationOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RowControl>
                <RowControl label={labels.brand}>
                  <Select
                    value={draft.brand ?? NONE}
                    onValueChange={(v) => {
                      const brand = v === NONE ? null : v;
                      // Đổi brand thì sản phẩm cũ (thuộc brand khác) không còn hợp lệ.
                      patch({ brand, product: brand === draft.brand ? draft.product : null });
                    }}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>{UNASSIGNED_ASSIGNMENT_LABEL}</SelectItem>
                      {brandOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RowControl>
                <RowControl label="Nguồn">
                  <Select value={draft.source} onValueChange={(v) => patch({ source: v as LeadSource })}>
                    <SelectTrigger size="sm" className="w-36">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCE_OPTIONS.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RowControl>
                <RowControl label="Chi tiết kênh">
                  <Select value={draft.channelDetail} onValueChange={(v) => patch({ channelDetail: v as ChannelDetail })}>
                    <SelectTrigger size="sm" className="w-36">
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
                </RowControl>
                <RowControl label="Phụ trách">
                  <Select
                    value={draft.assignee ?? "__NONE__"}
                    onValueChange={(v) => patch({ assignee: v === "__NONE__" ? null : v })}
                  >
                    <SelectTrigger size="sm" className="w-44">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">Chưa giao</SelectItem>
                      {assignees.map((name) => (
                        <SelectItem key={name} value={name}>
                          {name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </RowControl>
                <Row label="Tạo lúc" value={formatDateTime(lead.createdAt)} />
                <Row label="Số lần liên hệ" value={String(lead.contactCount)} />
              </dl>
            </div>

            {(attrFields.length > 0 || leftoverAttrs.length > 0) && (
              <div className="rounded-lg border border-dashed border-border p-4">
                <div className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                  Thông tin thêm từ form
                </div>
                <div className="space-y-3 text-sm">
                  {attrFields.map((field) => (
                    <div key={field.id} className="space-y-1">
                      <Label className="text-[13px] text-muted-foreground">
                        {field.label}
                        {field.required && <span className="text-rose-600"> *</span>}
                      </Label>
                      <AttrFieldInput field={field} value={attrDraft[field.key] ?? ""} onChange={(v) => patchAttr(field.key, v)} />
                    </div>
                  ))}
                  {leftoverAttrs.length > 0 && (
                    <dl className="space-y-2 border-t border-border pt-2">
                      {leftoverAttrs.map(([key, value]) => (
                        <Row key={key} label={key} value={value} />
                      ))}
                    </dl>
                  )}
                </div>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div>
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Cập nhật liên hệ
              </div>
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label className="text-[13px]">Phân loại</Label>
                  <Select value={draft.category} onValueChange={(v) => patch({ category: v as LeadCategory })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORY_VALUES.map((c) => (
                        <SelectItem key={c} value={c}>
                          {CATEGORY_LONG_LABEL[c]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                {draft.category === "FAIL" && (
                  <div className="space-y-1.5">
                    <Label className="text-[13px]">Lý do loại</Label>
                    <Select
                      value={draft.failReason ?? "__NONE__"}
                      onValueChange={(v) => patch({ failReason: v === "__NONE__" ? null : (v as FailReason) })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="— Chọn lý do —" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__NONE__">— Chọn lý do —</SelectItem>
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
                  <Label className="text-[13px]">{labels.product} quan tâm</Label>
                  <Select
                    value={draft.product ?? NONE}
                    onValueChange={(v) => patch({ product: v === NONE ? null : v })}
                    disabled={!draft.brand && productOptions.length === 0}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Chưa xác định —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={NONE}>— Chưa xác định —</SelectItem>
                      {productOptions.map((o) => (
                        <SelectItem key={o.value} value={o.value}>
                          {o.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {!draft.brand && (
                    <p className="text-[11px] text-muted-foreground">
                      Chọn {labels.brand.toLowerCase()} trước để có danh sách {labels.product.toLowerCase()}.
                    </p>
                  )}
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-[13px]">Nội dung đã liên hệ</Label>
                    {!readOnly && (
                      <div className="flex items-center gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-1.5 text-[11px] text-violet-600 hover:bg-violet-50 hover:text-violet-700"
                          disabled={Boolean(aiLoading)}
                          onClick={() => callCopilot("summarize")}
                        >
                          {aiLoading === "summarize" ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Sparkles className="size-3" />
                          )}
                          Tóm tắt
                        </Button>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 gap-1 px-1.5 text-[11px] text-blue-600 hover:bg-blue-50 hover:text-blue-700"
                          disabled={Boolean(aiLoading)}
                          onClick={() => callCopilot("suggest_action")}
                        >
                          {aiLoading === "suggest_action" ? (
                            <Loader2 className="size-3 animate-spin" />
                          ) : (
                            <Lightbulb className="size-3" />
                          )}
                          Gợi ý kịch bản
                        </Button>
                        {draft.careNote.trim() && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-6 gap-1 px-1.5 text-[11px] text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                            disabled={Boolean(aiLoading)}
                            onClick={() => callCopilot("polish_note")}
                          >
                            {aiLoading === "polish_note" ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <Wand2 className="size-3" />
                            )}
                            Chuẩn hóa
                          </Button>
                        )}
                      </div>
                    )}
                  </div>

                  <Textarea
                    value={draft.careNote}
                    onChange={(e) => patch({ careNote: e.target.value })}
                    placeholder={`VD: Đã tư vấn thông tin ${labels.product.toLowerCase()}, hẹn khách trao đổi thêm...`}
                    className="min-h-24"
                  />

                  {aiResult && (
                    <div className="rounded-lg border border-violet-200 bg-violet-50/50 p-2.5 text-[12px] shadow-xs">
                      <div className="flex items-center justify-between font-medium text-violet-800">
                        <span className="flex items-center gap-1.5">
                          <Sparkles className="size-3.5 text-violet-600" />
                          {aiResult.type === "summarize"
                            ? "Tóm tắt hồ sơ khách hàng"
                            : aiResult.type === "suggest_action"
                              ? "Gợi ý kịch bản tư vấn"
                              : "Ghi chú đã chuẩn hóa"}
                        </span>
                        <button
                          type="button"
                          onClick={() => setAiResult(null)}
                          className="text-violet-400 hover:text-violet-700"
                        >
                          <X className="size-3.5" />
                        </button>
                      </div>

                      <div className="mt-1.5 whitespace-pre-wrap rounded bg-white p-2 text-slate-700 border border-violet-100 leading-relaxed text-[11.5px]">
                        {aiResult.text}
                      </div>

                      <div className="mt-2 flex items-center justify-end gap-1.5">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-6 gap-1 px-2 text-[11px]"
                          onClick={() => {
                            void navigator.clipboard.writeText(aiResult.text);
                            setCopied(true);
                            setTimeout(() => setCopied(false), 2000);
                          }}
                        >
                          {copied ? <Check className="size-3 text-emerald-600" /> : <Copy className="size-3" />}
                          {copied ? "Đã chép" : "Sao chép"}
                        </Button>
                        {!readOnly && (
                          <Button
                            type="button"
                            size="sm"
                            className="h-6 gap-1 px-2 text-[11px] bg-violet-600 hover:bg-violet-700 text-white"
                            onClick={() => {
                              patch({ careNote: aiResult.text });
                              setAiPolishedNoteUsed(true);
                              setAiResult(null);
                            }}
                          >
                            Áp dụng vào ghi chú
                          </Button>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px]">Hẹn gọi lại</Label>
                  <Input type="date" value={draft.callbackAt} onChange={(e) => patch({ callbackAt: e.target.value })} />
                </div>
              </div>
            </div>

            <div>
              <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Nhật ký thao tác
              </div>
              <p className="mb-3 text-xs text-muted-foreground">Toàn bộ thay đổi trên lead — ai làm, lúc nào.</p>
              <ol className="space-y-3">
                {logs.map((log) => (
                  <li key={log.id} className="flex gap-2.5 text-[13px]">
                    <LogIcon kind={log.kind} />
                    <div className="min-w-0">
                      <p className="text-slate-700">{log.message}</p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {formatDateTime(log.at)} · {log.actor}
                        {log.byAi && <span className="ml-1 rounded bg-violet-50 px-1 text-violet-600">AI</span>}
                      </p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </div>
        </fieldset>

        <div className="border-t border-border bg-card px-6 py-4">
          {readOnly && (
            <p className="mb-2 text-center text-xs text-muted-foreground">Chỉ xem. Lead này chưa được giao cho bạn.</p>
          )}
          {dirty && !readOnly && <p className="mb-2 text-center text-xs font-medium text-amber-600">• Có thay đổi chưa lưu</p>}
          <Button
            onClick={handleSave}
            disabled={readOnly || !dirty}
            className={cn("w-full gap-2", (readOnly || !dirty) && "bg-primary/40")}
          >
            <Save className="size-4" />
            {dirty ? "Lưu thay đổi" : justSaved ? "Đã lưu" : "Không có thay đổi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Thêm giá trị hiện tại vào đầu danh sách nếu nó không còn trong danh mục. */
function attrsDirty(fields: AttrFieldRow[], draft: Record<string, string>, saved: Record<string, string>) {
  for (const field of fields) {
    const a = (draft[field.key] ?? "").trim();
    const b = (saved[field.key] ?? "").trim();
    if (a !== b) return true;
  }
  return false;
}

function AttrFieldInput({
  field,
  value,
  onChange,
}: {
  field: AttrFieldRow;
  value: string;
  onChange: (value: string) => void;
}) {
  if (field.fieldType === "select") {
    const options = withCurrent(
      field.options.map((o) => ({ value: o, label: o })),
      value || null,
    );
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)}>
        <SelectTrigger size="sm" className="w-full">
          <SelectValue placeholder="— Chọn —" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>— Chưa chọn —</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  }
  if (field.fieldType === "date") {
    return (
      <Input
        type="date"
        value={value ? toDateInputValue(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8"
      />
    );
  }
  return (
    <Input
      type={field.fieldType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8"
    />
  );
}

function withCurrent(options: { value: string; label: string }[], current: string | null) {
  if (!current || options.some((o) => o.value === current)) return options;
  return [{ value: current, label: current }, ...options];
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd className="truncate text-right font-medium text-slate-800" title={value}>
        {value}
      </dd>
    </div>
  );
}

function RowControl({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <dt className="shrink-0 text-muted-foreground">{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

const LOG_ICONS: Record<ActivityKind, React.ComponentType<{ className?: string }>> = {
  CALL: Phone,
  MISSED_CALL: PhoneMissed,
  STATUS_CHANGE: ArrowRightLeft,
  CATEGORY_CHANGE: ArrowRightLeft,
  ASSIGN_CHANGE: UserCog,
  NOTE: StickyNote,
  CREATE: StickyNote,
};

function LogIcon({ kind }: { kind: ActivityKind }) {
  const Icon = LOG_ICONS[kind] ?? StickyNote;
  return (
    <span
      className={cn(
        "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full",
        kind === "MISSED_CALL" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500",
      )}
    >
      <Icon className="size-3" />
    </span>
  );
}
