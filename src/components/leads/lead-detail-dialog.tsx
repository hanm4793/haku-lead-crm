"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Copy,
  MessageSquare,
  Pencil,
  Phone,
  PhoneMissed,
  RefreshCcw,
  Save,
  StickyNote,
  UserCog,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import {
  ASSIGNEES,
  B10_STATUS_LABEL,
  CAR_MODELS_BY_BRAND,
  UNASSIGNED_ASSIGNMENT_LABEL,
  CATEGORY_LONG_LABEL,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import type { ActivityKind, ActivityLog, ChannelDetail, FailReason, Lead, LeadCategory, LeadSource } from "@/lib/types";
import { cn, formatDateTime, toDateInputValue } from "@/lib/utils";

const CATEGORY_VALUES: LeadCategory[] = ["CHUA_PHAN_LOAI", "KHQT", "GDTD", "KHD", "CHUA_LH_DUOC", "FAIL"];

interface DraftState {
  source: LeadSource;
  channelDetail: ChannelDetail;
  assignee: string | null;
  category: LeadCategory;
  failReason: FailReason | null;
  carModel: string | null;
  careNote: string;
  callbackAt: string;
}

function toDraft(lead: Lead): DraftState {
  return {
    source: lead.source,
    channelDetail: lead.channelDetail,
    assignee: lead.assignee,
    category: lead.category,
    failReason: lead.failReason,
    carModel: lead.carModel,
    careNote: lead.careNote ?? "",
    callbackAt: toDateInputValue(lead.callbackAt),
  };
}

interface LeadDetailDialogProps {
  lead: Lead | null;
  logs: ActivityLog[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (patch: Partial<Lead>, logs: { kind: ActivityKind; message: string }[]) => void;
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
}: LeadDetailDialogProps & { lead: Lead }) {
  const [draft, setDraft] = React.useState<DraftState>(() => toDraft(lead));
  const [justSaved, setJustSaved] = React.useState(false);

  const patch = (next: Partial<DraftState>) => {
    setDraft((d) => ({ ...d, ...next }));
    setJustSaved(false);
  };

  const dirty =
    draft.source !== lead.source ||
    draft.channelDetail !== lead.channelDetail ||
    draft.assignee !== lead.assignee ||
    draft.category !== lead.category ||
    draft.failReason !== lead.failReason ||
    draft.carModel !== lead.carModel ||
    draft.careNote !== (lead.careNote ?? "") ||
    draft.callbackAt !== toDateInputValue(lead.callbackAt);

  const handleSave = () => {
    const entries: { kind: ActivityKind; message: string }[] = [];
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
      entries.push({ kind: "CALL", message: draft.careNote });
    }

    onSave(
      {
        source: draft.source,
        channelDetail: draft.channelDetail,
        assignee: draft.assignee,
        category: draft.category,
        failReason: draft.category === "FAIL" ? draft.failReason : null,
        carModel: draft.carModel,
        careNote: draft.careNote || null,
        callbackAt: draft.callbackAt ? new Date(draft.callbackAt).toISOString() : null,
        contactStatus: draft.careNote ? "DA_LIEN_HE" : lead.contactStatus,
      },
      entries,
    );
    setJustSaved(true);
  };

  const models = (lead.brand ? CAR_MODELS_BY_BRAND[lead.brand] : undefined) ?? [];

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

        <div className="thin-scrollbar grid max-h-[62vh] gap-5 overflow-y-auto p-6 lg:grid-cols-2">
          <div className="space-y-4">
            <div className="rounded-lg bg-[#f7f9fc] p-4">
              <dl className="space-y-2.5 text-sm">
                <Row
                  label="Showroom"
                  value={lead.showroom?.trim() ? lead.showroom : UNASSIGNED_ASSIGNMENT_LABEL}
                />
                <Row label="Thương hiệu" value={lead.brand ?? UNASSIGNED_ASSIGNMENT_LABEL} />
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
                <Row
                  label="Phòng bán hàng"
                  value={lead.salesRoom?.trim() ? lead.salesRoom : UNASSIGNED_ASSIGNMENT_LABEL}
                />
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
                      {ASSIGNEES.map((name) => (
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

            <div className="rounded-lg border border-border p-4">
              <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                Đối soát B10 (DDMS)
              </div>
              <dl className="space-y-2.5 text-sm">
                <Row label="Đã lên B10" value={lead.pushedToB10 ? "Đã đối soát" : "Chưa đối soát"} />
                <Row label="Trạng thái B10" value={B10_STATUS_LABEL[lead.b10Status]} />
                <Row label="Nội dung chăm sóc" value={lead.b10CareNote ?? "—"} />
              </dl>
              <Button variant="outline" size="sm" className="mt-3 w-full gap-2">
                <RefreshCcw className="size-3.5" />
                Đồng bộ lại từ B10
              </Button>
            </div>
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
                  <Label className="text-[13px]">Dòng xe quan tâm</Label>
                  <Select
                    value={draft.carModel ?? "__NONE__"}
                    onValueChange={(v) => patch({ carModel: v === "__NONE__" ? null : v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="— Chưa xác định —" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__NONE__">— Chưa xác định —</SelectItem>
                      {models.map((m) => (
                        <SelectItem key={m} value={m}>
                          {m}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-[13px]">Nội dung đã liên hệ</Label>
                  <Textarea
                    value={draft.careNote}
                    onChange={(e) => patch({ careNote: e.target.value })}
                    placeholder="VD: Đã tư vấn giá lăn bánh, khách hẹn cuối tuần ghé xem xe..."
                    className="min-h-24"
                  />
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

        <div className="border-t border-border bg-card px-6 py-4">
          {dirty && <p className="mb-2 text-center text-xs font-medium text-amber-600">• Có thay đổi chưa lưu</p>}
          <Button
            onClick={handleSave}
            disabled={!dirty}
            className={cn("w-full gap-2", !dirty && "bg-primary/40")}
          >
            <Save className="size-4" />
            {dirty ? "Lưu thay đổi" : justSaved ? "Đã lưu" : "Không có thay đổi"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
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
  B10_SYNC: RefreshCcw,
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
