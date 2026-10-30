"use client";

import * as React from "react";
import {
  ArrowRightLeft,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  ExternalLink,
  FileText,
  History,
  Lightbulb,
  Loader2,
  MessageSquare,
  Pencil,
  Phone,
  PhoneCall,
  PhoneMissed,
  Plus,
  Save,
  // Sparkles,
  StickyNote,
  UserCog,
  // Wand2,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/providers/toast-provider";
import { LeadCommentsSection } from "@/components/leads/lead-comments-section";
import { useLeadComments } from "@/hooks/use-lead-comments";
import { normalizePhone, phoneKey, validatePhone } from "@/lib/leads/phone";
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

const SYSTEM_ATTR_LABELS: Record<string, string> = {
  noi_dung_tin_nhan: "Nội dung tin nhắn",
  link_inbox: "Hộp thư Messenger",
  inbox_url: "Hộp thư Messenger",
  psid: "Mã khách hàng (PSID)",
  noi_dung_comment: "Nội dung bình luận",
  link_comment: "Bình luận Facebook",
  post_id: "Mã bài viết (Post ID)",
  fb_user_id: "Facebook User ID",
};

/** Chuyển chuỗi ISO sang định dạng YYYY-MM-DDTHH:mm theo giờ Việt Nam (+07:00) cho input datetime-local. */
function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const vnMs = d.getTime() + 7 * 60 * 60 * 1000;
  return new Date(vnMs).toISOString().slice(0, 16);
}

/** Chuyển giá trị từ input datetime-local (YYYY-MM-DDTHH:mm) sang ISO UTC theo múi giờ +07:00. */
function fromDateTimeLocalValue(val: string): string | null {
  const trimmed = val.trim();
  if (!trimmed) return null;
  if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}:00+07:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const d = new Date(`${trimmed}T23:59:59+07:00`);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  const d = new Date(trimmed);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

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
  contactCount: number;
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
    contactCount: lead.contactCount ?? 0,
    careNote: lead.careNote ?? "",
    callbackAt: toDateTimeLocalValue(lead.callbackAt),
  };
}

type DetailTab = "care" | "comments" | "details" | "logs";

const CATEGORY_BADGE: Record<LeadCategory, { label: string; className: string }> = {
  KHQT: { label: "Khách quan tâm", className: "border-emerald-200 bg-emerald-50 text-emerald-700" },
  GDTD: { label: "Giao dịch theo dõi", className: "border-blue-200 bg-blue-50 text-blue-700" },
  KHD: { label: "Ký hợp đồng", className: "border-violet-200 bg-violet-50 text-violet-700" },
  CHUA_LH_DUOC: { label: "Chưa LH được", className: "border-amber-200 bg-amber-50 text-amber-700" },
  FAIL: { label: "Không thành công", className: "border-rose-200 bg-rose-50 text-rose-700" },
  CHUA_PHAN_LOAI: { label: "Chưa phân loại", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

function CategoryBadge({ category }: { category: LeadCategory }) {
  const { label, className } = CATEGORY_BADGE[category] ?? CATEGORY_BADGE.CHUA_PHAN_LOAI;
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold",
        className,
      )}
    >
      {label}
    </span>
  );
}

const TAB_TRIGGER_CLASS =
  "relative h-11 shrink-0 rounded-none border-b-2 border-transparent px-3 text-xs font-semibold text-slate-600 shadow-none transition-colors data-[state=active]:border-primary data-[state=active]:bg-transparent data-[state=active]:text-primary";

const UNSAVED_CONFIRM = "Bạn có thay đổi chưa lưu. Đóng và bỏ các thay đổi này?";

interface LeadDetailDialogProps {
  lead: Lead | null;
  logs: ActivityLog[];
  logsLoading?: boolean;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Trả về false khi server từ chối, để dialog giữ nguyên chỗ đang sửa. */
  onSave: (
    patch: Partial<Lead>,
    logs: { kind: ActivityKind; message: string; byAi?: boolean }[],
  ) => boolean | void | Promise<boolean | void>;
  readOnly?: boolean;
  /** Chỉ cho phép sửa tên & SĐT khi lead được tạo thủ công / import (`source === "MANUAL"`). */
  canEditProfile?: boolean;
  canAssign?: boolean;
  onPrev?: () => void;
  onNext?: () => void;
  onLogCall?: (kind: "CALL" | "MISSED_CALL", message: string) => Promise<boolean>;
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
  logsLoading = false,
  open,
  onOpenChange,
  onSave,
  readOnly = false,
  canEditProfile,
  canAssign = true,
  onPrev,
  onNext,
  onLogCall,
  assignees = ASSIGNEES,
  catalog = DEFAULT_LEAD_CATALOG,
  attrFields = [],
}: LeadDetailDialogProps & { lead: Lead }) {
  const profileEditable = !readOnly && (canEditProfile ?? lead.source === "MANUAL");
  const [activeTab, setActiveTab] = React.useState<DetailTab>("care");
  const [draft, setDraft] = React.useState<DraftState>(() => toDraft(lead));
  const [attrDraft, setAttrDraft] = React.useState<Record<string, string>>(() => ({ ...(lead.attrs ?? {}) }));
  const [prevAttrs, setPrevAttrs] = React.useState(lead.attrs);
  if (lead.attrs !== prevAttrs) {
    setPrevAttrs(lead.attrs);
    setAttrDraft({ ...(lead.attrs ?? {}) });
  }
  const [justSaved, setJustSaved] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [loggingCall, setLoggingCall] = React.useState<"CALL" | "MISSED_CALL" | null>(null);
  const toast = useToast();
  const [editingProfile, setEditingProfile] = React.useState(false);
  const [profile, setProfile] = React.useState(() => ({
    name: lead.name ?? "",
    phone: lead.phone,
    createdAt: toDateTimeLocalValue(lead.createdAt),
  }));
  const [savingProfile, setSavingProfile] = React.useState(false);
  const [aiPolishedNoteUsed] = React.useState(false);
  const { labels } = catalog;

  const {
    comments,
    commentCount,
    canComment,
    loading: loadingComments,
    error: commentsError,
    submitting: submittingComment,
    reload: reloadComments,
    addComment,
  } = useLeadComments(lead.id);

  const defKeys = new Set(attrFields.map((f) => f.key));
  const leftoverAttrs = Object.entries(lead.attrs ?? {}).filter(([key]) => !defKeys.has(key));

  const patch = (next: Partial<DraftState>) => {
    setDraft((d) => ({ ...d, ...next }));
    setJustSaved(false);
  };

  const patchAttr = (key: string, value: string) => {
    setAttrDraft((prev) => ({ ...prev, [key]: value }));
    setJustSaved(false);
  };

  const profileDirty =
    profileEditable &&
    (profile.name.trim() !== (lead.name ?? "") ||
      normalizePhone(profile.phone) !== lead.phone ||
      profile.createdAt !== toDateTimeLocalValue(lead.createdAt));

  const formDirty =
    draft.source !== lead.source ||
    draft.channelDetail !== lead.channelDetail ||
    draft.assignee !== lead.assignee ||
    draft.category !== lead.category ||
    draft.failReason !== lead.failReason ||
    draft.brand !== lead.brand ||
    draft.product !== lead.product ||
    draft.location !== locationOf(lead) ||
    draft.contactCount !== lead.contactCount ||
    draft.careNote !== (lead.careNote ?? "") ||
    draft.callbackAt !== toDateTimeLocalValue(lead.callbackAt) ||
    attrsDirty(attrFields, attrDraft, lead.attrs ?? {});

  const dirty = formDirty || profileDirty;

  /** Chặn đóng nhầm (Esc, click nền, nút X) khi còn chỗ sửa chưa lưu. */
  const handleOpenChange = (next: boolean) => {
    if (!next && !readOnly && dirty && !window.confirm(UNSAVED_CONFIRM)) return;
    onOpenChange(next);
  };

  const handleNavigate = (cb?: () => void) => {
    if (!cb) return;
    if (!readOnly && dirty && !window.confirm(UNSAVED_CONFIRM)) return;
    cb();
  };

  const handleSave = React.useCallback(async () => {
    if (readOnly || !dirty || saving) return;

    const entries: { kind: ActivityKind; message: string; byAi?: boolean }[] = [];
    const savePatch: Partial<Lead> & { attrs?: Record<string, string> } = {
      source: draft.source,
      channelDetail: draft.channelDetail,
      assignee: draft.assignee,
      category: draft.category,
      failReason: draft.category === "FAIL" ? draft.failReason : null,
      brand: draft.brand,
      product: draft.product,
      location: draft.location ?? UNASSIGNED_ASSIGNMENT_LABEL,
      contactCount: draft.contactCount,
      careNote: draft.careNote || null,
      callbackAt: fromDateTimeLocalValue(draft.callbackAt),
      contactStatus: draft.careNote ? "DA_LIEN_HE" : lead.contactStatus,
    };

    if (profileDirty) {
      const trimmedName = profile.name.trim();
      const normalizedPhone = normalizePhone(profile.phone);
      const phoneProblem = validatePhone(profile.phone);
      if (!trimmedName) {
        toast.error("Không lưu được thông tin khách", "Họ tên không được để trống.");
        return;
      }
      if (trimmedName.length > 120) {
        toast.error("Không lưu được thông tin khách", "Họ tên tối đa 120 ký tự.");
        return;
      }
      if (phoneProblem) {
        toast.error("Không lưu được thông tin khách", phoneProblem);
        return;
      }
      if (trimmedName !== (lead.name ?? "")) {
        savePatch.name = trimmedName;
        entries.push({ kind: "NOTE", message: `Sửa họ tên: ${lead.name ?? "(trống)"} → ${trimmedName}.` });
      }
      if (phoneKey(normalizedPhone) !== phoneKey(lead.phone) || normalizedPhone !== lead.phone) {
        savePatch.phone = normalizedPhone;
        entries.push({ kind: "NOTE", message: `Sửa số điện thoại: ${lead.phone || "(trống)"} → ${normalizedPhone}.` });
      }
      if (profile.createdAt !== toDateTimeLocalValue(lead.createdAt)) {
        const nextCreatedIso = fromDateTimeLocalValue(profile.createdAt);
        if (!nextCreatedIso) {
          toast.error("Không lưu được thông tin khách", "Thời gian tạo không hợp lệ.");
          return;
        }
        savePatch.createdAt = nextCreatedIso;
        entries.push({ kind: "NOTE", message: `Cập nhật thời gian tạo: ${formatDateTime(nextCreatedIso)}.` });
      }
    }

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
    if (draft.contactCount !== lead.contactCount) {
      entries.push({
        kind: "NOTE",
        message: `Cập nhật số lần liên hệ: ${lead.contactCount} → ${draft.contactCount}.`,
      });
    }
    if (draft.careNote && draft.careNote !== (lead.careNote ?? "")) {
      entries.push({
        kind: "NOTE",
        message: draft.careNote,
        byAi: aiPolishedNoteUsed,
      });
    }

    if (attrFields.length > 0) {
      const attrsPatch: Record<string, string> = {};
      for (const field of attrFields) {
        attrsPatch[field.key] = attrDraft[field.key] ?? "";
      }
      savePatch.attrs = attrsPatch;
    }

    setSaving(true);
    try {
      const result = await onSave(savePatch, entries);
      if (result !== false) {
        setJustSaved(true);
        setEditingProfile(false);
      }
    } finally {
      setSaving(false);
    }
  }, [
    readOnly,
    dirty,
    saving,
    draft,
    lead,
    profileDirty,
    profile,
    toast,
    aiPolishedNoteUsed,
    attrFields,
    attrDraft,
    onSave,
  ]);

  // Phím tắt Ctrl+S / Cmd+S để lưu nhanh
  React.useEffect(() => {
    if (!open || readOnly) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "s") {
        e.preventDefault();
        if (dirty && !saving) {
          void handleSave();
        }
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, readOnly, dirty, saving, handleSave]);

  const startEditProfile = () => {
    if (!profileEditable) return;
    setProfile({
      name: lead.name ?? "",
      phone: lead.phone,
      createdAt: toDateTimeLocalValue(lead.createdAt),
    });
    setEditingProfile(true);
  };

  const saveProfile = async () => {
    const name = profile.name.trim();
    const phone = normalizePhone(profile.phone);
    const phoneProblem = validatePhone(profile.phone);
    if (!name) {
      toast.error("Không lưu được thông tin khách", "Họ tên không được để trống.");
      return;
    }
    if (name.length > 120) {
      toast.error("Không lưu được thông tin khách", "Họ tên tối đa 120 ký tự.");
      return;
    }
    if (phoneProblem) {
      toast.error("Không lưu được thông tin khách", phoneProblem);
      return;
    }

    const patchNow: Partial<Lead> = {};
    const entries: { kind: ActivityKind; message: string }[] = [];
    if (name !== (lead.name ?? "")) {
      patchNow.name = name;
      entries.push({ kind: "NOTE", message: `Sửa họ tên: ${lead.name ?? "(trống)"} → ${name}.` });
    }
    if (phoneKey(phone) !== phoneKey(lead.phone) || phone !== lead.phone) {
      patchNow.phone = phone;
      entries.push({ kind: "NOTE", message: `Sửa số điện thoại: ${lead.phone || "(trống)"} → ${phone}.` });
    }
    if (profile.createdAt !== toDateTimeLocalValue(lead.createdAt)) {
      const nextCreatedIso = fromDateTimeLocalValue(profile.createdAt);
      if (!nextCreatedIso) {
        toast.error("Không lưu được thông tin khách", "Thời gian tạo không hợp lệ.");
        return;
      }
      patchNow.createdAt = nextCreatedIso;
      entries.push({ kind: "NOTE", message: `Cập nhật thời gian tạo: ${formatDateTime(nextCreatedIso)}.` });
    }
    if (entries.length === 0) {
      setEditingProfile(false);
      return;
    }

    setSavingProfile(true);
    try {
      const result = await onSave(patchNow, entries);
      if (result === false) return;
      setEditingProfile(false);
    } finally {
      setSavingProfile(false);
    }
  };

  const handleQuickLogCall = async (kind: "CALL" | "MISSED_CALL") => {
    if (!onLogCall || loggingCall) return;
    setLoggingCall(kind);
    try {
      const msg =
        kind === "CALL"
          ? "Đã gọi điện trao đổi với khách hàng."
          : "Gọi điện nhưng khách không nghe máy (Gọi nhỡ).";
      const ok = await onLogCall(kind, msg);
      if (ok) {
        setDraft((d) => ({ ...d, contactCount: d.contactCount + 1 }));
      }
    } finally {
      setLoggingCall(null);
    }
  };

  const products = (draft.brand ? catalog.productsByBrand[draft.brand] : undefined) ?? [];
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
  const allowedSourceOptions =
    lead.source === "MANUAL"
      ? SOURCE_OPTIONS.filter((o) => o.value === "MANUAL")
      : SOURCE_OPTIONS.filter((o) => o.value !== "MANUAL");

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="flex max-h-[92vh] max-w-5xl flex-col gap-0 overflow-hidden p-0">
        {/* Header thông tin khách hàng — chừa chỗ bên phải cho nút đóng */}
        <div className="shrink-0 border-b border-border bg-white py-4 pl-6 pr-14">
          <div className="space-y-3">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0 flex-1">
                <DialogTitle className="flex items-center gap-2 text-xl font-bold text-slate-900">
                  <span className="truncate">{lead.name ?? "Khách chưa có tên"}</span>
                  {profileEditable && !editingProfile && (
                    <button
                      type="button"
                      title="Sửa tên, số điện thoại và ngày tạo"
                      aria-label="Sửa tên, số điện thoại và ngày tạo"
                      onClick={startEditProfile}
                      className="shrink-0 rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                    >
                      <Pencil className="size-4" />
                    </button>
                  )}
                </DialogTitle>

                {editingProfile ? (
                  <DialogDescription asChild>
                    <form
                      className="mt-2 space-y-2"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveProfile();
                      }}
                    >
                      <div className="grid gap-2 sm:grid-cols-3">
                        <div className="space-y-1">
                          <Label className="text-[12px] text-muted-foreground">Họ tên</Label>
                          <Input
                            value={profile.name}
                            onChange={(e) => setProfile((p) => ({ ...p, name: e.target.value }))}
                            placeholder="Khách chưa có tên"
                            maxLength={120}
                            autoFocus
                            disabled={savingProfile}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px] text-muted-foreground">Số điện thoại</Label>
                          <Input
                            value={profile.phone}
                            onChange={(e) => setProfile((p) => ({ ...p, phone: e.target.value }))}
                            inputMode="tel"
                            className="tabular-nums"
                            disabled={savingProfile}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label className="text-[12px] text-muted-foreground">Thời gian tạo</Label>
                          <Input
                            type="datetime-local"
                            value={profile.createdAt}
                            onChange={(e) => setProfile((p) => ({ ...p, createdAt: e.target.value }))}
                            disabled={savingProfile}
                          />
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Button type="submit" size="sm" disabled={savingProfile} className="gap-1.5">
                          {savingProfile ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                          Lưu thông tin khách
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          disabled={savingProfile}
                          onClick={() => {
                            setProfile({
                              name: lead.name ?? "",
                              phone: lead.phone,
                              createdAt: toDateTimeLocalValue(lead.createdAt),
                            });
                            setEditingProfile(false);
                          }}
                        >
                          Hủy
                        </Button>
                      </div>
                    </form>
                  </DialogDescription>
                ) : (
                  <DialogDescription asChild>
                    <div className="mt-1 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
                      {lead.phone ? (
                        <a
                          href={`tel:${lead.phone}`}
                          className="font-medium text-slate-800 tabular-nums hover:text-primary hover:underline"
                          title="Gọi trực tiếp"
                        >
                          {lead.phone}
                        </a>
                      ) : (
                        <span className="font-medium text-slate-800">Chưa có số điện thoại</span>
                      )}
                      {lead.phone && (
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              void navigator.clipboard?.writeText(lead.phone);
                              toast.info("Đã sao chép số điện thoại");
                            }}
                            title="Sao chép số"
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                          >
                            <Copy className="size-3.5" />
                          </button>
                          <a
                            href={`tel:${lead.phone}`}
                            title="Gọi điện"
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                          >
                            <Phone className="size-3.5" />
                          </a>
                          <a
                            href={`https://zalo.me/${lead.phone}`}
                            target="_blank"
                            rel="noreferrer"
                            title="Nhắn Zalo"
                            className="rounded p-1 text-slate-400 transition-colors hover:bg-slate-100 hover:text-primary"
                          >
                            <MessageSquare className="size-3.5" />
                          </a>
                          {!readOnly && onLogCall && (
                            <div className="ml-1 flex items-center gap-1">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={Boolean(loggingCall)}
                                onClick={() => void handleQuickLogCall("CALL")}
                                className="h-6 gap-1 px-2 text-[11px] text-emerald-700 hover:bg-emerald-50"
                              >
                                {loggingCall === "CALL" ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <PhoneCall className="size-3" />
                                )}
                                Ghi cuộc gọi
                              </Button>
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                disabled={Boolean(loggingCall)}
                                onClick={() => void handleQuickLogCall("MISSED_CALL")}
                                className="h-6 gap-1 px-2 text-[11px] text-rose-700 hover:bg-rose-50"
                              >
                                {loggingCall === "MISSED_CALL" ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <PhoneMissed className="size-3" />
                                )}
                                Gọi nhỡ
                              </Button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  </DialogDescription>
                )}
              </div>

              {(onPrev || onNext) && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!onPrev}
                    onClick={() => handleNavigate(onPrev)}
                    title="Lead trước"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    <ChevronLeft className="size-3.5" />
                    Trước
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    disabled={!onNext}
                    onClick={() => handleNavigate(onNext)}
                    title="Lead tiếp theo"
                    className="h-7 gap-1 px-2 text-xs"
                  >
                    Tiếp
                    <ChevronRight className="size-3.5" />
                  </Button>
                </div>
              )}
            </div>

            {/* Quick status badges, nằm dưới thông tin khách để không đè nút đóng */}
            <div className="flex flex-wrap items-center gap-2">
              <CategoryBadge category={draft.category} />
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-medium text-slate-600">
                {[draft.brand || `Chưa chọn ${labels.brand.toLowerCase()}`, draft.product, draft.location || `Chưa phân bổ ${labels.location.toLowerCase()}`]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs text-slate-600">
                Phụ trách: <strong className="font-medium text-slate-800">{draft.assignee || "Chưa giao"}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Thanh Tab điều hướng theo tính năng */}
        <Tabs
          value={activeTab}
          onValueChange={(v) => setActiveTab(v as DetailTab)}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="shrink-0 overflow-x-auto overflow-y-hidden border-b border-border bg-slate-50/80 px-6">
            <TabsList className="flex h-11 w-max justify-start gap-4 rounded-none bg-transparent p-0">
              <TabsTrigger value="care" className={TAB_TRIGGER_CLASS}>
                <PhoneCall className="size-4" />
                Xử lý & Chăm sóc
              </TabsTrigger>
              <TabsTrigger value="comments" className={TAB_TRIGGER_CLASS}>
                <MessageSquare className="size-4" />
                Bình luận
                {commentCount > 0 && (
                  <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-bold text-primary">
                    {commentCount}
                  </span>
                )}
              </TabsTrigger>
              <TabsTrigger value="details" className={TAB_TRIGGER_CLASS}>
                <FileText className="size-4" />
                Form & Marketing
              </TabsTrigger>
              <TabsTrigger value="logs" className={TAB_TRIGGER_CLASS}>
                <History className="size-4" />
                Nhật ký
                <span className="rounded-full bg-slate-200/70 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {logs.length}
                </span>
              </TabsTrigger>
            </TabsList>
          </div>

          <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
            {/* TAB 1: XỬ LÝ & CHĂM SÓC */}
            <TabsContent value="care" className="mt-0 space-y-4">
              <div className="grid gap-4 lg:grid-cols-12 lg:items-stretch">
                {/* Cột trái: Thông tin liên hệ & phân bổ */}
                <fieldset disabled={readOnly} className="flex flex-col gap-4 border-0 p-0 lg:col-span-5">
                  <div className="rounded-lg border border-border bg-slate-50/60 p-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Phân bổ & Trách nhiệm
                    </div>
                    <dl className="space-y-3 text-sm">
                      <RowControl label={labels.location}>
                        <Select
                          value={draft.location ?? NONE}
                          onValueChange={(v) => patch({ location: v === NONE ? null : v })}
                        >
                          <SelectTrigger size="sm" className="w-48 bg-white">
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

                      <RowControl label="Phụ trách">
                        <Select
                          value={draft.assignee ?? NONE}
                          onValueChange={(v) => patch({ assignee: v === NONE ? null : v })}
                          disabled={readOnly || !canAssign}
                        >
                          <SelectTrigger size="sm" className="w-48 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Chưa giao</SelectItem>
                            {assignees.map((name) => (
                              <SelectItem key={name} value={name}>
                                {name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </RowControl>
                    </dl>
                  </div>

                  <div className="flex-1 rounded-lg border border-border bg-slate-50/60 p-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Kênh & Nguồn tiếp cận
                    </div>
                    <dl className="space-y-3 text-sm">
                      <RowControl label="Nguồn">
                        <Select
                          value={draft.source}
                          onValueChange={(v) => patch({ source: v as LeadSource })}
                          disabled={readOnly || lead.source === "MANUAL"}
                        >
                          <SelectTrigger size="sm" className="w-48 bg-white">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {allowedSourceOptions.map((o) => (
                              <SelectItem key={o.value} value={o.value}>
                                {o.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </RowControl>

                      <RowControl label="Chi tiết kênh">
                        <Select
                          value={draft.channelDetail}
                          onValueChange={(v) => patch({ channelDetail: v as ChannelDetail })}
                        >
                          <SelectTrigger size="sm" className="w-48 bg-white">
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

                      <Row label="Tạo lúc" value={formatDateTime(lead.createdAt)} />

                      <RowControl label="Số lần liên hệ">
                        <Input
                          type="number"
                          min={0}
                          max={9999}
                          value={draft.contactCount}
                          onChange={(e) => {
                            const val = parseInt(e.target.value, 10);
                            patch({ contactCount: isNaN(val) ? 0 : Math.min(9999, Math.max(0, val)) });
                          }}
                          disabled={readOnly}
                          className="h-8 w-48 bg-white text-sm tabular-nums"
                        />
                      </RowControl>
                    </dl>
                  </div>
                </fieldset>

                {/* Cột phải: Cập nhật kết quả tư vấn — lên đầu trên mobile vì là việc chính */}
                <fieldset
                  disabled={readOnly}
                  className="order-first flex flex-col border-0 p-0 lg:order-0 lg:col-span-7"
                >
                  <div className="flex flex-1 flex-col rounded-lg border border-border bg-white p-4 shadow-2xs">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Cập nhật kết quả tư vấn
                    </div>

                    <div className="flex flex-1 flex-col gap-3.5">
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-medium">Phân loại khách</Label>
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
                            <Label className="text-[13px] font-medium">Lý do loại</Label>
                            <Select
                              value={draft.failReason ?? NONE}
                              onValueChange={(v) => patch({ failReason: v === NONE ? null : (v as FailReason) })}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="— Chọn lý do —" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value={NONE}>— Chọn lý do —</SelectItem>
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
                          <Label className="text-[13px] font-medium">{labels.brand}</Label>
                          <Select
                            value={draft.brand ?? NONE}
                            onValueChange={(v) => {
                              const brand = v === NONE ? null : v;
                              patch({ brand, product: brand === draft.brand ? draft.product : null });
                            }}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={`— Chọn ${labels.brand.toLowerCase()} —`} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value={NONE}>— Chưa chọn —</SelectItem>
                              {brandOptions.map((o) => (
                                <SelectItem key={o.value} value={o.value}>
                                  {o.label}
                                                              </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-medium">{labels.product} quan tâm</Label>
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
                              Chọn {labels.brand.toLowerCase()} trước để lọc danh sách {labels.product.toLowerCase()}.
                            </p>
                          )}
                        </div>

                        <div className="space-y-1.5">
                          <Label className="text-[13px] font-medium">Hẹn gọi lại</Label>
                          <Input
                            type="datetime-local"
                            value={draft.callbackAt}
                            onChange={(e) => patch({ callbackAt: e.target.value })}
                          />
                        </div>
                      </div>

                      {/* Ghi chú chăm sóc & Gợi ý kịch bản mẫu */}
                      <div className="flex flex-1 flex-col space-y-1.5">
                        <div className="flex items-center justify-between">
                          <Label className="text-[13px] font-medium">Ghi chú nội dung đã liên hệ</Label>
                          {!readOnly && (
                            <div className="flex items-center gap-1">
                              <SaleNoteTemplatePicker
                                productLabel={draft.product || draft.brand || labels.product.toLowerCase()}
                                locationLabel={draft.location || labels.location.toLowerCase()}
                                customerName={lead.name || "anh/chị"}
                                onSelectTemplate={(text) =>
                                  patch({
                                    careNote: draft.careNote.trim()
                                      ? `${draft.careNote.trim()}\n${text}`
                                      : text,
                                  })
                                }
                              />
                            </div>
                          )}
                        </div>

                        <Textarea
                          value={draft.careNote}
                          onChange={(e) => patch({ careNote: e.target.value })}
                          placeholder={`VD: Đã tư vấn thông tin ${labels.product.toLowerCase()}, hẹn khách tuần sau ghé ${labels.location.toLowerCase()}...`}
                          className="min-h-24 flex-1 leading-relaxed"
                        />
                      </div>
                    </div>
                  </div>
                </fieldset>
              </div>

              {/* Field phụ do project cấu hình — trải rộng full-width theo lưới 3 cột để cân đối bố cục */}
              {attrFields.length > 0 && (
                <fieldset disabled={readOnly} className="border-0 p-0">
                  <div className="rounded-lg border border-border bg-slate-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Thông tin bổ sung
                      </div>
                      <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                        {attrFields.length} trường
                      </span>
                    </div>
                    <div className="grid gap-x-4 gap-y-3 sm:grid-cols-2 lg:grid-cols-3">
                      {attrFields.map((field) => (
                        <div key={field.id} className="space-y-1">
                          <Label className="text-[12.5px] text-muted-foreground">
                            {field.label}
                            {field.required && <span className="text-rose-600"> *</span>}
                          </Label>
                          <AttrFieldInput
                            field={field}
                            value={attrDraft[field.key] ?? ""}
                            onChange={(v) => patchAttr(field.key, v)}
                            disabled={readOnly}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                </fieldset>
              )}
            </TabsContent>

            {/* TAB 2: BÌNH LUẬN & TRAO ĐỔI NỘI BỘ */}
            <TabsContent value="comments" className="mt-0">
              <LeadCommentsSection
                comments={comments}
                loading={loadingComments}
                error={commentsError}
                onRetry={reloadComments}
                submitting={submittingComment}
                canComment={canComment}
                readOnly={readOnly}
                onAddComment={addComment}
              />
            </TabsContent>

            {/* TAB 3: DỮ LIỆU FORM & MARKETING */}
            <TabsContent value="details" className="mt-0">
              <fieldset disabled={readOnly} className="border-0 p-0">
                <div className="grid gap-6 lg:grid-cols-2">
                  {/* Cột 1: Câu hỏi & dữ liệu từ form khách điền */}
                  <div className="rounded-lg border border-border bg-slate-50/60 p-4">
                    <div className="mb-3 flex items-center justify-between">
                      <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                        Dữ liệu từ Form / Tin nhắn / Bình luận
                      </div>
                      {leftoverAttrs.length > 0 && (
                        <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                          {leftoverAttrs.length} trường
                        </span>
                      )}
                    </div>

                    {leftoverAttrs.length === 0 ? (
                      <p className="py-6 text-center text-xs text-muted-foreground">
                        Không có câu trả lời nào chưa được cấu hình thành field phụ.
                      </p>
                    ) : (
                      <dl className="space-y-2.5 text-sm">
                        {leftoverAttrs.map(([key, value]) => {
                          const trimmed = (value ?? "").trim();
                          const attrLabel = SYSTEM_ATTR_LABELS[key] ?? key;
                          const isUrl = /^https?:\/\//i.test(trimmed);
                          if (isUrl) {
                            const isFbComment = key === "link_comment";
                            const isFbInbox = !isFbComment && (key === "inbox_url" || key === "link_inbox" || /facebook\.com|fb\.com/i.test(trimmed));
                            return (
                              <RowControl key={key} label={attrLabel}>
                                <a
                                  href={trimmed}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="inline-flex items-center gap-1.5 rounded-md border border-blue-200 bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700 transition-colors hover:bg-blue-100 hover:text-blue-800"
                                >
                                  <span>{isFbComment ? "Mở bình luận Facebook" : isFbInbox ? "Mở Inbox Facebook" : "Mở liên kết"}</span>
                                  <ExternalLink className="size-3.5" />
                                </a>
                              </RowControl>
                            );
                          }
                          return <Row key={key} label={attrLabel} value={value} />;
                        })}
                      </dl>
                    )}
                  </div>

                  {/* Cột 2: Thông tin chiến dịch & kỹ thuật */}
                  <div className="rounded-lg border border-border bg-slate-50/60 p-4">
                    <div className="mb-3 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                      Chiến dịch & Thông số Marketing
                    </div>

                    <dl className="space-y-3 text-sm">
                      <Row label="Chiến dịch" value={lead.campaign || "—"} />
                      <Row label="Nội dung quảng cáo" value={lead.adContent || "—"} />
                      <Row
                        label="Chi phí / lead"
                        value={lead.costPerLead != null ? `${lead.costPerLead.toLocaleString("vi-VN")} đ` : "—"}
                      />
                      <Row label="Mã Page Facebook" value={lead.facebookPageId || "—"} />
                      <Row label="Số lần liên hệ" value={String(draft.contactCount)} />
                      <Row
                        label="Lần liên hệ cuối"
                        value={lead.lastContactAt ? formatDateTime(lead.lastContactAt) : "Chưa liên hệ"}
                      />
                    </dl>
                  </div>
                </div>
              </fieldset>
            </TabsContent>

            {/* TAB 4: NHẬT KÝ THAO TÁC */}
            <TabsContent value="logs" className="mt-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                      Lịch sử & Nhật ký hoạt động
                    </h3>
                    <p className="text-xs text-muted-foreground">Toàn bộ thao tác trên lead — ai thực hiện, lúc nào.</p>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600">
                    {logs.length} thao tác
                  </span>
                </div>

                {logsLoading ? (
                  <div className="flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-10 text-xs text-muted-foreground">
                    <Loader2 className="size-4 animate-spin" />
                    Đang tải nhật ký hoạt động...
                  </div>
                ) : logs.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-border py-8 text-center text-xs text-muted-foreground">
                    Chưa có nhật ký ghi nhận.
                  </div>
                ) : (
                  <ol className="divide-y divide-border/60 rounded-lg border border-border bg-white shadow-2xs">
                    {logs.map((log) => (
                      <li key={log.id} className="flex items-start gap-3 p-3.5 text-[13px] transition-colors hover:bg-slate-50/50">
                        <LogIcon kind={log.kind} />
                        <div className="min-w-0 flex-1">
                          <p className="font-medium text-slate-800">{log.message}</p>
                          <p className="mt-0.5 text-[11.5px] text-muted-foreground">
                            {formatDateTime(log.at)} · <span className="font-medium text-slate-600">{log.actor}</span>
                            {log.byAi && (
                              <span className="ml-1.5 rounded bg-violet-50 px-1 py-0.5 text-[10.5px] font-semibold text-violet-700">
                                AI
                              </span>
                            )}
                          </p>
                        </div>
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </TabsContent>
          </div>
        </Tabs>

        {/* Footer lưu thay đổi */}
        <div className="flex shrink-0 items-center justify-between border-t border-border bg-white px-6 py-3.5">
          <div className="text-xs text-muted-foreground">
            {readOnly ? (
              <span className="text-slate-500">Chế độ chỉ xem. Lead này chưa được giao cho bạn.</span>
            ) : dirty ? (
              <span className="font-medium text-amber-600">• Có thông tin chưa lưu (Ctrl+S để lưu)</span>
            ) : justSaved ? (
              <span className="font-medium text-emerald-600">✓ Đã lưu tất cả thay đổi</span>
            ) : (
              <span>Không có thay đổi</span>
            )}
          </div>

          <div className="flex items-center gap-2">
            <Button type="button" variant="outline" size="sm" onClick={() => handleOpenChange(false)}>
              Đóng
            </Button>
            {!readOnly && (
              <Button
                type="button"
                size="sm"
                onClick={() => void handleSave()}
                disabled={!dirty || saving}
                className="gap-1.5"
              >
                {saving ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
                Lưu thay đổi
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

interface SaleTemplateItem {
  id: string;
  title: string;
  content: string;
  custom?: boolean;
}

const CUSTOM_TEMPLATES_STORAGE_KEY = "haku:sale-note-templates";

const DEFAULT_SALE_TEMPLATES: SaleTemplateItem[] = [
  {
    id: "quote-interested",
    title: "Đã tư vấn & báo giá (Khách quan tâm)",
    content: "Đã liên hệ tư vấn thông tin và báo giá {san_pham}. Khách hàng quan tâm, đang cân nhắc thêm và hẹn phản hồi lại.",
  },
  {
    id: "visit-appointment",
    title: "Hẹn khách ghé trực tiếp / Trải nghiệm",
    content: "Đã tư vấn chi tiết {san_pham}. Khách hẹn sắp xếp thời gian ghé {dai_ly} để xem và trải nghiệm trực tiếp.",
  },
  {
    id: "zalo-installment",
    title: "Gửi bảng tính trả góp & ưu đãi qua Zalo",
    content: "Đã kết bạn Zalo và gửi bảng tính chi phí trả góp kèm chương trình ưu đãi {san_pham}. Đang chờ khách xem và phản hồi.",
  },
  {
    id: "no-answer",
    title: "Gọi chưa nghe máy (Chưa LH được)",
    content: "Liên hệ số điện thoại nhưng khách chưa bắt máy. Đã nhắn tin Zalo giới thiệu thông tin {san_pham}, hẹn gọi lại khung giờ khác.",
  },
  {
    id: "busy-callback",
    title: "Khách đang bận — Hẹn gọi lại sau",
    content: "Khách đang bận công việc chưa tiện trao đổi, hẹn liên hệ lại vào khung giờ thuận tiện hơn.",
  },
  {
    id: "researching",
    title: "Khách tham khảo giá — Chưa mua ngay",
    content: "Khách mới tìm hiểu thông tin {san_pham} để tham khảo giá, dự kiến thời gian tới mới có kế hoạch mua. Lưu lịch chăm sóc định kỳ.",
  },
  {
    id: "not-interested",
    title: "Không còn nhu cầu / Đã mua nơi khác",
    content: "Đã trao đổi nhưng khách không còn nhu cầu / đã mua sản phẩm nơi khác.",
  },
];

function interpolateTemplate(
  raw: string,
  vars: { productLabel: string; locationLabel: string; customerName: string },
): string {
  return raw
    .replace(/\{san_pham\}/g, vars.productLabel)
    .replace(/\{dai_ly\}/g, vars.locationLabel)
    .replace(/\{ten\}/g, vars.customerName);
}

function SaleNoteTemplatePicker({
  productLabel,
  locationLabel,
  customerName,
  onSelectTemplate,
}: {
  productLabel: string;
  locationLabel: string;
  customerName: string;
  onSelectTemplate: (text: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [adding, setAdding] = React.useState(false);
  const [newTitle, setNewTitle] = React.useState("");
  const [newContent, setNewContent] = React.useState("");
  const [customTemplates, setCustomTemplates] = React.useState<SaleTemplateItem[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      const saved = window.localStorage.getItem(CUSTOM_TEMPLATES_STORAGE_KEY);
      return saved ? (JSON.parse(saved) as SaleTemplateItem[]) : [];
    } catch {
      return [];
    }
  });

  const saveCustomTemplates = (next: SaleTemplateItem[]) => {
    setCustomTemplates(next);
    try {
      window.localStorage.setItem(CUSTOM_TEMPLATES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // ignore storage quota errors
    }
  };

  const handleAddCustom = () => {
    const title = newTitle.trim();
    const content = newContent.trim();
    if (!title || !content) return;
    const item: SaleTemplateItem = {
      id: `custom-${Date.now()}`,
      title,
      content,
      custom: true,
    };
    saveCustomTemplates([item, ...customTemplates]);
    setNewTitle("");
    setNewContent("");
    setAdding(false);
  };

  const handleDeleteCustom = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    saveCustomTemplates(customTemplates.filter((t) => t.id !== id));
  };

  const allTemplates = [...customTemplates, ...DEFAULT_SALE_TEMPLATES];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-1.5 text-[11px] text-blue-600 hover:bg-blue-50 hover:text-blue-700"
        >
          <Lightbulb className="size-3" />
          Gợi ý kịch bản
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-88 p-2.5 sm:w-96">
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-semibold text-slate-800">Chọn mẫu ghi chú / kịch bản sale</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-6 gap-1 px-2 text-[11px] text-primary"
            onClick={() => setAdding((v) => !v)}
          >
            <Plus className="size-3" />
            {adding ? "Đóng" : "Tạo mẫu mới"}
          </Button>
        </div>

        {adding && (
          <div className="mb-2.5 space-y-2 rounded-md border border-border bg-slate-50 p-2.5">
            <Input
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              placeholder="Tên kịch bản (VD: Hẹn lái thử cuối tuần)"
              className="h-7 bg-white text-xs"
            />
            <Textarea
              value={newContent}
              onChange={(e) => setNewContent(e.target.value)}
              placeholder="Nội dung mẫu... (hỗ trợ biến {san_pham}, {dai_ly}, {ten})"
              rows={2}
              className="min-h-14 bg-white text-xs"
            />
            <div className="flex justify-end gap-1.5">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-6 px-2 text-[11px]"
                onClick={() => setAdding(false)}
              >
                Hủy
              </Button>
              <Button
                type="button"
                size="sm"
                className="h-6 px-2.5 text-[11px]"
                disabled={!newTitle.trim() || !newContent.trim()}
                onClick={handleAddCustom}
              >
                Lưu mẫu
              </Button>
            </div>
          </div>
        )}

        <div className="thin-scrollbar max-h-64 space-y-1 overflow-y-auto">
          {allTemplates.map((tpl) => {
            const preview = interpolateTemplate(tpl.content, {
              productLabel,
              locationLabel,
              customerName,
            });
            return (
              <div
                key={tpl.id}
                role="button"
                tabIndex={0}
                onClick={() => {
                  onSelectTemplate(preview);
                  setOpen(false);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectTemplate(preview);
                    setOpen(false);
                  }
                }}
                className="group flex cursor-pointer items-start justify-between gap-2 rounded-md border border-transparent p-2 text-left transition-colors hover:border-blue-100 hover:bg-blue-50/50"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="text-xs font-semibold text-slate-800 group-hover:text-blue-700">
                      {tpl.title}
                    </span>
                    {tpl.custom && (
                      <span className="rounded bg-blue-100 px-1 py-0.2 text-[9px] font-semibold text-blue-700">
                        Tự tạo
                      </span>
                    )}
                  </div>
                  <p className="mt-0.5 line-clamp-2 text-[11.5px] leading-snug text-muted-foreground">
                    {preview}
                  </p>
                </div>
                {tpl.custom && (
                  <button
                    type="button"
                    onClick={(e) => handleDeleteCustom(tpl.id, e)}
                    className="shrink-0 rounded p-1 text-slate-400 hover:bg-rose-50 hover:text-rose-600"
                    title="Xóa mẫu này"
                  >
                    <X className="size-3" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </PopoverContent>
    </Popover>
  );
}

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
  disabled = false,
}: {
  field: AttrFieldRow;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
}) {
  if (field.fieldType === "select") {
    const options = withCurrent(
      field.options.map((o) => ({ value: o, label: o })),
      value || null,
    );
    return (
      <Select value={value || NONE} onValueChange={(v) => onChange(v === NONE ? "" : v)} disabled={disabled}>
        <SelectTrigger size="sm" className="w-full bg-white text-xs">
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
  if (field.fieldType === "multiselect") {
    const selected = value
      ? value
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean)
      : [];
    const known = new Set(field.options);
    const mergedOptions = [
      ...selected.filter((s) => !known.has(s)),
      ...field.options,
    ].map((o) => ({ value: o, label: o }));

    return (
      <MultiSelect
        options={mergedOptions}
        selected={selected}
        onChange={(next) => onChange(next.join(", "))}
        placeholder="— Chọn nhiều —"
        searchable={mergedOptions.length > 5}
        disabled={disabled}
        displayMode="labels"
        className="h-8 bg-white text-xs"
      />
    );
  }
  if (field.fieldType === "boolean") {
    const checked = value === "true";
    return (
      <label
        className={cn(
          "flex h-8 cursor-pointer items-center gap-2.5 rounded-md border border-input bg-white px-3 text-xs shadow-xs transition-colors hover:bg-slate-50",
          disabled && "cursor-not-allowed opacity-50",
        )}
      >
        <Checkbox
          checked={checked}
          disabled={disabled}
          onCheckedChange={(c) => onChange(c ? "true" : "false")}
        />
        <span className={cn("font-medium", checked ? "text-slate-800" : "text-muted-foreground")}>
          {checked ? "Có" : "Không"}
        </span>
      </label>
    );
  }
  if (field.fieldType === "date") {
    return (
      <Input
        type="date"
        value={value ? toDateInputValue(value) : ""}
        onChange={(e) => onChange(e.target.value)}
        className="h-8 bg-white"
      />
    );
  }
  return (
    <Input
      type={field.fieldType === "number" ? "number" : "text"}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-8 bg-white"
    />
  );
}

/** Thêm giá trị hiện tại vào đầu danh sách nếu nó không còn trong danh mục. */
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
        "mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-full",
        kind === "MISSED_CALL" ? "bg-rose-50 text-rose-600" : "bg-slate-100 text-slate-500",
      )}
    >
      <Icon className="size-3.5" />
    </span>
  );
}
