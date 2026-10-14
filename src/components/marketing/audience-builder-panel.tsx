"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  CloudUpload,
  Download,
  ExternalLink,
  Filter,
  FolderKanban,
  Layers,
  Loader2,
  Plus,
  RefreshCw,
  Sparkles,
  Split,
  Trash2,
  Users,
  AlertTriangle,
} from "lucide-react";

import {
  createAudienceSegmentAction,
  deleteAudienceSegmentAction,
  listAdAccountsForAudienceAction,
  previewAudienceAction,
  syncAudienceToFacebookAction,
} from "@/app/marketing/audience-actions";
import { ConfirmDialog } from "@/components/common/crud-dialogs";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { AudienceExportFormat } from "@/lib/audiences/customer-audience";
import {
  CATEGORY_CHART_LABEL,
  CONTACT_STATUS_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import type {
  AudiencePreviewResult,
  AudienceSegmentView,
} from "@/lib/db/audiences-repo";
import type { AudienceFilterConfig } from "@/lib/db/schema";
import type { AccessibleAdAccount } from "@/lib/facebook/custom-audiences";
import type {
  ContactStatus,
  FailReason,
  LeadCategory,
  LeadSource,
} from "@/lib/types";
import { cn, formatDateTime, formatNumber } from "@/lib/utils";

export interface AudienceProjectOption {
  id: string;
  name: string;
}

export interface AudiencePageOption {
  id: string;
  name: string | null;
  projectId: string | null;
}

const PRESETS: Array<{
  id: string;
  label: string;
  desc: string;
  badge: string;
  categories: LeadCategory[];
  contactStatuses?: ContactStatus[];
  suffix: string;
}> = [
  {
    id: "qualified_plus",
    label: "Tệp Khách chất lượng (KHQT+)",
    desc: "Gồm Quan tâm (KHQT), Giao dịch theo dõi (GDTD) & Ký HĐ (KHĐ) — Tối ưu tạo Lookalike 1%-5%",
    badge: "Khuyên dùng cho LAL",
    categories: ["KHQT", "GDTD", "KHD"],
    suffix: "Khách chất lượng (KHQT+)",
  },
  {
    id: "won_contracts",
    label: "Tệp Đã ký hợp đồng (KHĐ)",
    desc: "Khách đã chốt đơn — Dùng làm tệp gốc Lookalike siêu nét hoặc Exclude khỏi chiến dịch tìm khách mới",
    badge: "Chốt đơn / Exclude",
    categories: ["KHD"],
    suffix: "Khách Đã Ký HĐ (KHĐ)",
  },
  {
    id: "remarketing",
    label: "Tệp Bám đuổi / Remarketing",
    desc: "Khách quan tâm (KHQT, GDTD) hoặc Chưa liên hệ được để chạy quảng cáo bám đuổi nhắc nhớ",
    badge: "Retargeting",
    categories: ["KHQT", "GDTD", "CHUA_LH_DUOC"],
    suffix: "Tệp Bám đuổi Remarketing",
  },
  {
    id: "exclusion_fail",
    label: "Tệp Loại trừ (Khách Loại / Rác)",
    desc: "Khách Sai số, Trùng/Spam, Không có nhu cầu — Đẩy lên để Exclude tránh lãng phí ngân sách Ads",
    badge: "Loại trừ (Exclude)",
    categories: ["FAIL"],
    suffix: "Tệp Loại trừ (Fail)",
  },
];

const AUDIENCE_CATEGORY_OPTIONS: Array<{ value: LeadCategory; label: string }> = [
  { value: "KHQT", label: CATEGORY_CHART_LABEL.KHQT },
  { value: "GDTD", label: CATEGORY_CHART_LABEL.GDTD },
  { value: "KHD", label: CATEGORY_CHART_LABEL.KHD },
  { value: "CHUA_LH_DUOC", label: CATEGORY_CHART_LABEL.CHUA_LH_DUOC },
  { value: "CHUA_PHAN_LOAI", label: CATEGORY_CHART_LABEL.CHUA_PHAN_LOAI },
  { value: "FAIL", label: CATEGORY_CHART_LABEL.FAIL },
];

const EXPORT_PLATFORM_OPTIONS: Array<{
  format: AudienceExportFormat;
  label: string;
  sub: string;
}> = [
  {
    format: "meta_csv",
    label: "Facebook Custom Audience (.csv)",
    sub: "Chuẩn cột phone (84...), email, fn, ln, country",
  },
  {
    format: "google_csv",
    label: "Google Ads Customer Match (.csv)",
    sub: "Chuẩn E.164 (+84...), Email, First/Last Name, Country",
  },
  {
    format: "tiktok_csv",
    label: "TikTok Ads Custom Audience (.csv)",
    sub: "Chuẩn SĐT E.164 + mã băm SHA-256",
  },
  {
    format: "zalo_txt",
    label: "Zalo Ads Danh sách SĐT (.txt)",
    sub: "Mỗi dòng 1 SĐT nội địa đã lọc sạch trùng",
  },
];

const ALL_PROJECTS_VALUE = "__ALL_PROJECTS__";

export function AudienceBuilderPanel({
  activeProjectId,
  projects,
  allPages,
  initialSegments,
  defaultAdAccountId,
  tokenConfigured,
}: {
  activeProjectId: string | null;
  projects: AudienceProjectOption[];
  allPages: AudiencePageOption[];
  initialSegments: AudienceSegmentView[];
  defaultAdAccountId: string | null;
  tokenConfigured: boolean;
}) {
  const router = useRouter();
  const toast = useToast();

  // State bộ lọc tạo tệp
  const [selectedProjectId, setSelectedProjectId] = React.useState<string>(
    activeProjectId ?? projects[0]?.id ?? ALL_PROJECTS_VALUE,
  );
  const [selectedPageIds, setSelectedPageIds] = React.useState<string[]>([]);
  const [pageQuery, setPageQuery] = React.useState("");
  const [categories, setCategories] = React.useState<LeadCategory[]>([
    "KHQT",
    "GDTD",
    "KHD",
  ]);
  const [contactStatuses, setContactStatuses] = React.useState<ContactStatus[]>([]);
  const [failReasons, setFailReasons] = React.useState<FailReason[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  // Chế độ tạo tệp: gộp nhiều page thành 1 tệp hay tách riêng từng fanpage
  const [creationMode, setCreationMode] = React.useState<"merge" | "split_by_page">("merge");
  const [segmentName, setSegmentName] = React.useState("");
  const [segmentDesc, setSegmentDesc] = React.useState("");
  const [syncImmediately, setSyncImmediately] = React.useState(true);

  // Tài khoản quảng cáo Facebook từ tài khoản tổng
  const [adAccounts, setAdAccounts] = React.useState<AccessibleAdAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = React.useState(false);
  const [selectedAdAccountId, setSelectedAdAccountId] = React.useState<string>(
    defaultAdAccountId ?? "",
  );

  // Preview & Saved segments
  const [preview, setPreview] = React.useState<AudiencePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [deletingSegment, setDeletingSegment] = React.useState<AudienceSegmentView | null>(null);
  const [deletingPending, setDeletingPending] = React.useState(false);

  // Đồng bộ theo project switcher trên header nếu người dùng chuyển dự án
  const [lastActiveProjectId, setLastActiveProjectId] = React.useState(activeProjectId);
  if (activeProjectId !== lastActiveProjectId) {
    setLastActiveProjectId(activeProjectId);
    if (activeProjectId) {
      setSelectedProjectId(activeProjectId);
      setSelectedPageIds([]);
    }
  }

  const effectiveProjectId =
    selectedProjectId === ALL_PROJECTS_VALUE ? null : selectedProjectId;

  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const pageNameById = React.useMemo(
    () =>
      new Map(
        allPages.map((p) => [p.id, p.name?.trim() || `Page ${p.id}`]),
      ),
    [allPages],
  );

  // Danh sách fanpage thuộc dự án đang chọn
  const projectPages = React.useMemo(() => {
    const scoped = effectiveProjectId
      ? allPages.filter((p) => p.projectId === effectiveProjectId)
      : allPages;
    const q = pageQuery.trim().toLowerCase();
    if (!q) return scoped;
    return scoped.filter(
      (p) =>
        (p.name ?? "").toLowerCase().includes(q) || p.id.toLowerCase().includes(q),
    );
  }, [allPages, effectiveProjectId, pageQuery]);

  const allScopedPages = React.useMemo(
    () =>
      effectiveProjectId
        ? allPages.filter((p) => p.projectId === effectiveProjectId)
        : allPages,
    [allPages, effectiveProjectId],
  );

  // Tự động gợi ý tên tệp thông minh khi đổi dự án / fanpage / phân loại
  const autoSuggestedName = React.useMemo(() => {
    const projLabel = effectiveProjectId
      ? projectNameById.get(effectiveProjectId) ?? "Dự án"
      : "Tất cả dự án";

    let pagePart = "Tất cả Fanpage";
    if (creationMode === "split_by_page") {
      pagePart = "Tách theo từng Fanpage";
    } else if (selectedPageIds.length === 1) {
      pagePart = pageNameById.get(selectedPageIds[0]!) ?? selectedPageIds[0]!;
    } else if (selectedPageIds.length > 1) {
      pagePart = `Gộp ${selectedPageIds.length} Fanpage`;
    }

    const catPart =
      categories.length > 0
        ? categories.map((c) => CATEGORY_CHART_LABEL[c]).join(" + ")
        : "Tất cả phân loại";

    return `[${projLabel} · ${pagePart}] ${catPart}`;
  }, [
    effectiveProjectId,
    projectNameById,
    creationMode,
    selectedPageIds,
    pageNameById,
    categories,
  ]);

  // Tải danh sách Tài khoản Quảng cáo từ tài khoản tổng khi bấm nút Làm mới
  const refreshAdAccounts = React.useCallback(async () => {
    if (!tokenConfigured) return;
    setLoadingAccounts(true);
    try {
      const res = await listAdAccountsForAudienceAction();
      if (res.ok) {
        setAdAccounts(res.accounts);
        setSelectedAdAccountId((prev) => prev || res.accounts[0]?.id || "");
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, [tokenConfigured]);

  React.useEffect(() => {
    if (!tokenConfigured) return;
    let cancelled = false;
    void listAdAccountsForAudienceAction().then((res) => {
      if (!cancelled && res.ok) {
        setAdAccounts(res.accounts);
        setSelectedAdAccountId((prev) => prev || res.accounts[0]?.id || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenConfigured]);

  const currentFilters: AudienceFilterConfig = React.useMemo(
    () => ({
      facebookPageIds: selectedPageIds,
      categories,
      contactStatuses,
      failReasons,
      sources,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    [
      selectedPageIds,
      categories,
      contactStatuses,
      failReasons,
      sources,
      dateFrom,
      dateTo,
    ],
  );

  // Tự động cập nhật Preview khi thay đổi điều kiện lọc
  React.useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(async () => {
      setPreviewLoading(true);
      try {
        const res = await previewAudienceAction({
          projectId: effectiveProjectId,
          filters: currentFilters,
        });
        if (!cancelled && res.ok) {
          setPreview(res.preview);
        }
      } finally {
        if (!cancelled) setPreviewLoading(false);
      }
    }, 250);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [effectiveProjectId, currentFilters]);

  const togglePageId = (pageId: string) => {
    setSelectedPageIds((prev) =>
      prev.includes(pageId) ? prev.filter((id) => id !== pageId) : [...prev, pageId],
    );
  };

  const applyPreset = (preset: (typeof PRESETS)[number]) => {
    setCategories(preset.categories);
    setContactStatuses(preset.contactStatuses ?? []);
    if (!preset.categories.includes("FAIL")) {
      setFailReasons([]);
    }
    const projLabel = effectiveProjectId
      ? projectNameById.get(effectiveProjectId) ?? "Dự án"
      : "Tất cả dự án";
    const pagePart =
      selectedPageIds.length === 1
        ? pageNameById.get(selectedPageIds[0]!) ?? selectedPageIds[0]!
        : selectedPageIds.length > 1
          ? `Gộp ${selectedPageIds.length} Fanpage`
          : "Tất cả Fanpage";
    setSegmentName(`[${projLabel} · ${pagePart}] ${preset.suffix}`);
  };

  const handleCreateAndSync = async () => {
    const finalName = segmentName.trim() || autoSuggestedName;
    setSaving(true);
    try {
      const res = await createAudienceSegmentAction({
        name: finalName,
        description: segmentDesc.trim() || null,
        projectId: effectiveProjectId,
        filters: currentFilters,
        facebookAdAccountId: selectedAdAccountId || null,
        mode: creationMode,
        syncImmediately: syncImmediately && Boolean(selectedAdAccountId),
      });

      if (!res.ok) {
        toast.error("Không thể tạo tệp khách hàng", res.error);
        return;
      }

      if (res.syncError) {
        toast.warning(
          `Đã lưu ${res.count} tệp nhưng chưa đẩy được lên Facebook`,
          res.syncError,
        );
      } else if (res.syncedCount > 0) {
        toast.success(
          `Đã tạo & đẩy ${res.syncedCount} tệp lên Facebook Custom Audience!`,
          `Tài khoản QC: ${selectedAdAccountId}`,
        );
      } else {
        toast.success(
          res.count > 1
            ? `Đã tách và tạo ${res.count} tệp khách hàng theo từng Fanpage!`
            : "Đã lưu tệp khách hàng thành công!",
        );
      }

      setSegmentName("");
      setSegmentDesc("");
      router.refresh();
    } finally {
      setSaving(false);
    }
  };

  const handleSyncSegment = async (segment: AudienceSegmentView) => {
    const targetAccount =
      segment.facebookAdAccountId || selectedAdAccountId || defaultAdAccountId;
    if (!targetAccount) {
      toast.error(
        "Chưa chọn Tài khoản Quảng cáo",
        "Hãy chọn một Tài khoản Quảng cáo Facebook (act_...) ở khung cấu hình trước khi đồng bộ.",
      );
      return;
    }

    setSyncingId(segment.id);
    try {
      const res = await syncAudienceToFacebookAction({
        segmentId: segment.id,
        adAccountId: targetAccount,
      });
      if (!res.ok) {
        toast.error("Đồng bộ lên Facebook thất bại", res.error);
        return;
      }
      toast.success(
        res.result.createdNewAudience
          ? "Đã tạo mới Custom Audience trên Facebook!"
          : "Đã cập nhật Custom Audience trên Facebook!",
        `Audience ID: ${res.result.audienceId} · Đã đẩy ${formatNumber(res.result.uploadedCount)} khách hàng.`,
      );
      router.refresh();
    } finally {
      setSyncingId(null);
    }
  };

  const handleAdHocExport = async (format: AudienceExportFormat) => {
    try {
      const res = await fetch("/api/audiences/export", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: segmentName.trim() || autoSuggestedName,
          projectId: effectiveProjectId,
          filters: currentFilters,
          format,
        }),
      });
      if (!res.ok) {
        toast.error("Xuất tệp thất bại", "Vui lòng kiểm tra lại bộ lọc.");
        return;
      }
      const blob = await res.blob();
      const disposition = res.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const fileName = match?.[1] ?? `audience-${format}.csv`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("Đã tải tệp khách hàng chuẩn hóa!");
    } catch {
      toast.error("Không thể tải tệp khách hàng.");
    }
  };

  const loadSegmentIntoBuilder = (segment: AudienceSegmentView) => {
    setSelectedProjectId(segment.projectId ?? ALL_PROJECTS_VALUE);
    setSelectedPageIds(segment.filters.facebookPageIds ?? []);
    setCategories(segment.filters.categories ?? []);
    setContactStatuses(segment.filters.contactStatuses ?? []);
    setFailReasons(segment.filters.failReasons ?? []);
    setSources(segment.filters.sources ?? []);
    setDateFrom(segment.filters.dateFrom ?? "");
    setDateTo(segment.filters.dateTo ?? "");
    setSegmentName(segment.name);
    setSegmentDesc(segment.description ?? "");
    if (segment.facebookAdAccountId) {
      setSelectedAdAccountId(segment.facebookAdAccountId);
    }
    toast.success("Đã nạp cấu hình tệp lên bộ lọc!");
  };

  return (
    <div className="space-y-5">
      {/* Banner giải thích cơ chế Master Account */}
      <div className="rounded-xl border border-blue-200/80 bg-gradient-to-r from-blue-50/90 via-indigo-50/50 to-white p-4 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Sparkles className="size-4 text-blue-600" />
              <h2 className="text-sm font-bold text-slate-900">
                Trung tâm Sinh tệp Khách hàng (Audience Hub) & Đẩy ngược lên Nền tảng Quảng cáo
              </h2>
            </div>
            <p className="text-xs text-slate-600">
              Lọc khách hàng theo <strong>từng Dự án</strong>, <strong>1 hoặc gộp nhiều Fanpage trong cùng Dự án</strong> (hoặc tự động tách riêng từng Fanpage), tự động chuẩn hóa SĐT quốc tế <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">+84</code>, khử trùng lặp và băm bảo mật <code className="rounded bg-white px-1 py-0.5 font-mono text-[11px]">SHA-256</code> để đẩy thẳng lên <strong>Facebook Custom Audience</strong> (qua tài khoản tổng của bạn) hoặc xuất tệp chuẩn cho <strong>Google Ads, TikTok Ads, Zalo Ads</strong>.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant={tokenConfigured ? "success" : "warning"}>
              {tokenConfigured ? "Đã kết nối Facebook Master Token" : "Chưa cấu hình FACEBOOK_ACCESS_TOKEN"}
            </Badge>
          </div>
        </div>
      </div>

      {/* 4 Preset chọn nhanh */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {PRESETS.map((preset) => {
          const isActive =
            categories.length === preset.categories.length &&
            preset.categories.every((c) => categories.includes(c));
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => applyPreset(preset)}
              className={cn(
                "group flex flex-col justify-between rounded-xl border p-3.5 text-left transition-all",
                isActive
                  ? "border-primary bg-primary/5 shadow-xs ring-1 ring-primary/30"
                  : "border-border/80 bg-card hover:border-primary/40 hover:bg-slate-50/70",
              )}
            >
              <div>
                <div className="mb-1.5 flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-900 group-hover:text-primary">
                    {preset.label}
                  </span>
                  <span className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                    {preset.badge}
                  </span>
                </div>
                <p className="text-[11px] leading-relaxed text-slate-500">{preset.desc}</p>
              </div>
              <div className="mt-2.5 flex flex-wrap gap-1">
                {preset.categories.map((cat) => (
                  <span
                    key={cat}
                    className="rounded bg-white px-1.5 py-0.5 text-[10px] font-medium text-slate-700 shadow-2xs ring-1 ring-slate-200"
                  >
                    {CATEGORY_CHART_LABEL[cat]}
                  </span>
                ))}
              </div>
            </button>
          );
        })}
      </div>

      {/* Khung chính: Trái = Cấu hình Dự án / Multi-Fanpage / Bộ lọc | Phải = Xem trước & Đẩy Ads */}
      <div className="grid gap-5 lg:grid-cols-12">
        {/* Cột trái: Bộ tạo tệp (7 cột) */}
        <div className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs lg:col-span-7">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Filter className="size-4 text-primary" />
              <h3 className="text-sm font-bold text-slate-900">
                1. Chọn Dự án, Fanpage & Điều kiện lọc Tệp
              </h3>
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-7 text-xs text-slate-500"
              onClick={() => {
                setSelectedPageIds([]);
                setCategories(["KHQT", "GDTD", "KHD"]);
                setContactStatuses([]);
                setFailReasons([]);
                setSources([]);
                setDateFrom("");
                setDateTo("");
                setSegmentName("");
              }}
            >
              Đặt lại mặc định
            </Button>
          </div>

          {/* Bước 1A: Chọn Dự án */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <FolderKanban className="size-3.5 text-primary" />
                Dự án nguồn
              </label>
              <Select
                value={selectedProjectId}
                onValueChange={(val) => {
                  setSelectedProjectId(val);
                  setSelectedPageIds([]);
                }}
              >
                <SelectTrigger className="h-9 text-xs">
                  <SelectValue placeholder="Chọn dự án" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL_PROJECTS_VALUE}>
                    Tất cả dự án ({projects.length})
                  </SelectItem>
                  {projects.map((proj) => (
                    <SelectItem key={proj.id} value={proj.id}>
                      {proj.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <Split className="size-3.5 text-indigo-600" />
                Chế độ gom / tách Fanpage
              </label>
              <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-border/80 bg-slate-50 p-1">
                <button
                  type="button"
                  onClick={() => setCreationMode("merge")}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition",
                    creationMode === "merge"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  <Layers className="mr-1 inline size-3 text-primary" />
                  Gộp chung 1 tệp
                </button>
                <button
                  type="button"
                  onClick={() => setCreationMode("split_by_page")}
                  className={cn(
                    "rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition",
                    creationMode === "split_by_page"
                      ? "bg-white text-slate-900 shadow-2xs"
                      : "text-slate-600 hover:text-slate-900",
                  )}
                >
                  <Split className="mr-1 inline size-3 text-indigo-600" />
                  Tách riêng từng Page
                </button>
              </div>
            </div>
          </div>

          {/* Bước 1B: Multi-Select Fanpage trong dự án */}
          <div className="space-y-2 rounded-lg border border-slate-200/90 bg-slate-50/60 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xs font-semibold text-slate-800">
                  Chọn Fanpage trong dự án{" "}
                  <span className="font-normal text-slate-500">
                    ({selectedPageIds.length === 0
                      ? `Đang lấy tất cả ${allScopedPages.length} Fanpage & Lead của dự án`
                      : `Đã chọn ${selectedPageIds.length}/${allScopedPages.length} Fanpage`})
                  </span>
                </p>
                <p className="text-[11px] text-slate-500">
                  Tích chọn <strong>1 hoặc nhiều Fanpage</strong> để gộp chung thành 1 tệp lớn, hoặc để trống để lấy toàn bộ dự án.
                </p>
              </div>
              <div className="flex items-center gap-1.5">
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="h-7 px-2 text-[11px]"
                  disabled={allScopedPages.length === 0}
                  onClick={() => setSelectedPageIds(allScopedPages.map((p) => p.id))}
                >
                  Chọn hết ({allScopedPages.length})
                </Button>
                {selectedPageIds.length > 0 && (
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    className="h-7 px-2 text-[11px] text-slate-600"
                    onClick={() => setSelectedPageIds([])}
                  >
                    Bỏ chọn (Lấy toàn dự án)
                  </Button>
                )}
              </div>
            </div>

            {allScopedPages.length > 4 && (
              <Input
                value={pageQuery}
                onChange={(e) => setPageQuery(e.target.value)}
                placeholder="Tìm nhanh tên Fanpage hoặc Page ID..."
                className="h-8 bg-white text-xs"
              />
            )}

            {projectPages.length === 0 ? (
              <p className="py-3 text-center text-xs text-slate-500">
                Dự án này chưa có Fanpage nào hoặc không khớp từ khóa tìm kiếm.
              </p>
            ) : (
              <div className="thin-scrollbar grid max-h-44 gap-1.5 overflow-y-auto pr-1 sm:grid-cols-2">
                {projectPages.map((page) => {
                  const checked = selectedPageIds.includes(page.id);
                  return (
                    <label
                      key={page.id}
                      className={cn(
                        "flex cursor-pointer items-center gap-2.5 rounded-lg border px-2.5 py-2 text-xs transition",
                        checked
                          ? "border-primary/60 bg-primary/5 font-medium text-slate-900"
                          : "border-slate-200 bg-white text-slate-700 hover:border-slate-300",
                      )}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => togglePageId(page.id)}
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-medium">
                          {page.name?.trim() || `Fanpage ${page.id}`}
                        </p>
                        <p className="truncate font-mono text-[10px] text-slate-400">
                          ID: {page.id}
                        </p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>

          {/* Bước 1C: Điều kiện lọc chất lượng Lead */}
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Phân loại khách hàng (Category)
              </label>
              <MultiSelect
                placeholder="Tất cả phân loại"
                options={AUDIENCE_CATEGORY_OPTIONS}
                selected={categories}
                onChange={(vals) => setCategories(vals as LeadCategory[])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Trạng thái liên hệ
              </label>
              <MultiSelect
                placeholder="Tất cả trạng thái"
                options={CONTACT_STATUS_OPTIONS}
                selected={contactStatuses}
                onChange={(vals) => setContactStatuses(vals as ContactStatus[])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Nguồn Lead (Source)
              </label>
              <MultiSelect
                placeholder="Tất cả nguồn"
                options={SOURCE_OPTIONS}
                selected={sources}
                onChange={(vals) => setSources(vals as LeadSource[])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Lý do loại (Khi lọc tệp Fail)
              </label>
              <MultiSelect
                placeholder="Tất cả lý do loại"
                options={FAIL_REASON_OPTIONS}
                selected={failReasons}
                onChange={(vals) => setFailReasons(vals as FailReason[])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Từ ngày tạo Lead
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => setDateFrom(e.target.value)}
                className="h-9 text-xs"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-700">
                Đến ngày tạo Lead
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => setDateTo(e.target.value)}
                className="h-9 text-xs"
              />
            </div>
          </div>

          {/* Bước 2: Đặt tên & Chọn Tài khoản Quảng cáo Facebook đích */}
          <div className="space-y-3 border-t border-border/60 pt-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-500">
              2. Đặt tên tệp & Chọn Tài khoản Quảng cáo Facebook đích
            </h4>

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-700">
                  Tên tệp khách hàng (Custom Audience Name)
                </label>
                <Input
                  value={segmentName}
                  onChange={(e) => setSegmentName(e.target.value)}
                  placeholder={autoSuggestedName}
                  className="h-9 text-xs"
                />
                <p className="text-[10px] text-slate-400">
                  Để trống sẽ tự đặt: <span className="font-medium text-slate-600">{autoSuggestedName}</span>
                </p>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-slate-700">
                    Tài khoản Quảng cáo Facebook (Master Token)
                  </label>
                  <button
                    type="button"
                    onClick={() => void refreshAdAccounts()}
                    className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                  >
                    <RefreshCw className={cn("size-3", loadingAccounts && "animate-spin")} />
                    Làm mới TKQC
                  </button>
                </div>
                {adAccounts.length > 0 ? (
                  <Select
                    value={selectedAdAccountId}
                    onValueChange={setSelectedAdAccountId}
                  >
                    <SelectTrigger className="h-9 text-xs">
                      <SelectValue placeholder="Chọn Tài khoản Quảng cáo (act_...)" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((acc) => (
                        <SelectItem key={acc.id} value={acc.id}>
                          {acc.name} ({acc.id}){acc.isDefault ? " · Mặc định" : ""}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={selectedAdAccountId}
                    onChange={(e) => setSelectedAdAccountId(e.target.value)}
                    placeholder="Nhập mã TKQC (VD: act_123456789)"
                    className="h-9 font-mono text-xs"
                  />
                )}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-slate-700">
                <Checkbox
                  checked={syncImmediately}
                  onCheckedChange={(v) => setSyncImmediately(Boolean(v))}
                />
                <span>
                  Tự động tạo & đẩy danh sách khách hàng lên{" "}
                  <strong>Facebook Custom Audience</strong> ngay khi bấm Lưu
                </span>
              </label>

              <Button
                onClick={() => void handleCreateAndSync()}
                disabled={saving}
                className="gap-1.5"
              >
                {saving ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : syncImmediately && selectedAdAccountId ? (
                  <CloudUpload className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {creationMode === "split_by_page"
                  ? "Tách & Tạo tệp cho từng Fanpage"
                  : syncImmediately && selectedAdAccountId
                    ? "Lưu & Đẩy thẳng lên Facebook"
                    : "Lưu Tệp khách hàng"}
              </Button>
            </div>
          </div>
        </div>

        {/* Cột phải: Xem trước trực tiếp & Xuất nhanh đa nền tảng (5 cột) */}
        <div className="space-y-4 rounded-xl border border-border/80 bg-card p-5 shadow-xs lg:col-span-5">
          <div className="flex items-center justify-between border-b border-border/60 pb-3">
            <div className="flex items-center gap-2">
              <Users className="size-4 text-emerald-600" />
              <h3 className="text-sm font-bold text-slate-900">
                Xem trước Quy mô Tệp & Xuất nhanh Đa nền tảng
              </h3>
            </div>
            {previewLoading && (
              <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                <Loader2 className="size-3.5 animate-spin" />
                Đang tính...
              </span>
            )}
          </div>

          {/* 4 Thẻ chỉ số quy mô tệp */}
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 lg:grid-cols-2">
            <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3">
              <p className="text-[11px] font-medium text-slate-500">Khách hàng duy nhất</p>
              <p className="mt-1 text-xl font-bold text-emerald-700">
                {formatNumber(preview?.stats.uniqueContacts ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Từ {formatNumber(preview?.stats.totalMatchedLeads ?? 0)} lead (lọc trùng{" "}
                {formatNumber(preview?.stats.duplicatesRemoved ?? 0)})
              </p>
            </div>

            <div className="rounded-lg border border-slate-200/80 bg-slate-50/70 p-3">
              <p className="text-[11px] font-medium text-slate-500">SĐT chuẩn hóa (+84)</p>
              <p className="mt-1 text-xl font-bold text-slate-900">
                {formatNumber(preview?.stats.validPhones ?? 0)}
              </p>
              <p className="mt-0.5 text-[10px] text-slate-500">
                Email hợp lệ: {formatNumber(preview?.stats.validEmails ?? 0)} · FB Lead ID:{" "}
                {formatNumber(preview?.stats.withFacebookLeadId ?? 0)}
              </p>
            </div>
          </div>

          {/* Cảnh báo quy mô tối thiểu 100 của Meta */}
          {preview && preview.stats.uniqueContacts > 0 && preview.stats.uniqueContacts < 100 && (
            <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 p-2.5 text-[11px] text-amber-900">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-amber-600" />
              <span>
                Tệp hiện có <strong>{preview.stats.uniqueContacts} khách hàng</strong>. Meta yêu cầu tối thiểu khoảng <strong>100 người khớp</strong> để chạy quảng cáo hoặc tạo Lookalike — bạn có thể tích gộp thêm Fanpage trong cùng dự án để tăng quy mô tệp.
              </span>
            </div>
          )}

          {/* Phân bổ theo từng Fanpage trong bộ lọc hiện tại */}
          {preview && preview.byFanpage.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">
                Phân bổ khách hàng theo Fanpage ({preview.byFanpage.length} nguồn)
              </p>
              <div className="thin-scrollbar max-h-36 overflow-y-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-slate-100 text-[11px] font-semibold text-slate-600">
                    <tr>
                      <th className="px-2.5 py-1.5">Fanpage</th>
                      <th className="px-2.5 py-1.5 text-right">Lead thô</th>
                      <th className="px-2.5 py-1.5 text-right">Khách duy nhất</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {preview.byFanpage.map((fp) => (
                      <tr key={fp.facebookPageId} className="hover:bg-slate-50">
                        <td className="max-w-[180px] truncate px-2.5 py-1.5 font-medium text-slate-800">
                          {fp.facebookPageName}
                        </td>
                        <td className="px-2.5 py-1.5 text-right text-slate-600">
                          {formatNumber(fp.rawLeadCount)}
                        </td>
                        <td className="px-2.5 py-1.5 text-right font-semibold text-emerald-700">
                          {formatNumber(fp.uniqueContactCount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Xuất nhanh file chuẩn hóa cho 4 nền tảng */}
          <div className="space-y-2 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-slate-800">
              Tải nhanh tệp khách hàng cho các nền tảng quảng cáo:
            </p>
            <div className="grid gap-2 sm:grid-cols-2">
              {EXPORT_PLATFORM_OPTIONS.map((opt) => (
                <button
                  key={opt.format}
                  type="button"
                  disabled={!preview || preview.stats.uniqueContacts === 0}
                  onClick={() => void handleAdHocExport(opt.format)}
                  className="flex items-start gap-2 rounded-lg border border-slate-200 bg-white p-2.5 text-left transition hover:border-primary/50 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  <Download className="mt-0.5 size-3.5 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <p className="truncate text-xs font-semibold text-slate-800">
                      {opt.label}
                    </p>
                    <p className="text-[10px] text-slate-500">{opt.sub}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          {/* Mẫu dữ liệu khách hàng đã chuẩn hóa & băm SHA-256 */}
          <div className="space-y-1.5 border-t border-border/60 pt-3">
            <p className="text-xs font-semibold text-slate-700">
              Mẫu dữ liệu chuẩn hóa & băm SHA-256 (20 khách đầu tiên)
            </p>
            {!preview || preview.sampleContacts.length === 0 ? (
              <p className="rounded-lg border border-dashed border-slate-200 py-6 text-center text-xs text-slate-400">
                Chưa có khách hàng nào khớp với bộ lọc hiện tại.
              </p>
            ) : (
              <div className="thin-scrollbar max-h-48 overflow-auto rounded-lg border border-border/70">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-slate-100 font-semibold text-slate-600">
                    <tr>
                      <th className="px-2 py-1.5">Khách hàng</th>
                      <th className="px-2 py-1.5">SĐT (E.164)</th>
                      <th className="px-2 py-1.5">SHA-256 (Meta)</th>
                      <th className="px-2 py-1.5">Phân loại</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border/60">
                    {preview.sampleContacts.map((c) => (
                      <tr key={c.key} className="hover:bg-slate-50">
                        <td className="max-w-[120px] truncate px-2 py-1.5 font-medium text-slate-800">
                          {c.fullName || "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-slate-700">
                          {c.phoneE164 || c.email || "—"}
                        </td>
                        <td className="px-2 py-1.5 font-mono text-[10px] text-slate-400">
                          {c.phoneSha256
                            ? `${c.phoneSha256.slice(0, 8)}…${c.phoneSha256.slice(-6)}`
                            : "—"}
                        </td>
                        <td className="px-2 py-1.5">
                          <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                            {CATEGORY_CHART_LABEL[c.category]}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Bảng quản lý danh sách Tệp khách hàng đã lưu & Trạng thái đồng bộ Facebook */}
      <div className="rounded-xl border border-border/80 bg-card p-5 shadow-xs">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900">
              Danh sách Tệp khách hàng đã lưu ({initialSegments.length})
            </h3>
            <p className="text-xs text-slate-500">
              Quản lý các tệp khách hàng theo Dự án / Fanpage, bấm <strong>Đồng bộ Facebook</strong> để cập nhật số mới lên Custom Audience hoặc tải file cho Google / TikTok / Zalo.
            </p>
          </div>
        </div>

        {initialSegments.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 py-10 text-center">
            <p className="text-sm font-semibold text-slate-700">
              Chưa có tệp khách hàng nào được lưu
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Hãy chọn Dự án, tích chọn 1 hoặc nhiều Fanpage ở khung phía trên rồi bấm{" "}
              <strong>Lưu & Đẩy thẳng lên Facebook</strong>.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-lg border border-border/80">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-100/90 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-3 py-2.5">Tên tệp & Dự án</th>
                  <th className="px-3 py-2.5">Phạm vi Fanpage</th>
                  <th className="px-3 py-2.5">Điều kiện lọc</th>
                  <th className="px-3 py-2.5 text-right">Khách duy nhất</th>
                  <th className="px-3 py-2.5">Trạng thái Facebook Custom Audience</th>
                  <th className="px-3 py-2.5 text-right">Đẩy Ads / Xuất tệp</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {initialSegments.map((seg) => {
                  const pageIds = seg.filters.facebookPageIds ?? [];
                  const cats = seg.filters.categories ?? [];
                  const isSyncing = syncingId === seg.id;
                  const cleanActId = seg.facebookAdAccountId?.replace(/^act_/, "") ?? "";

                  return (
                    <tr key={seg.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => loadSegmentIntoBuilder(seg)}
                          className="text-left font-bold text-slate-900 hover:text-primary hover:underline"
                          title="Bấm để nạp lại cấu hình tệp này lên trình lọc"
                        >
                          {seg.name}
                        </button>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {seg.projectName ?? "Tất cả dự án"}
                          </Badge>
                          <span>Tạo: {formatDateTime(seg.createdAt)}</span>
                        </div>
                      </td>

                      <td className="max-w-[220px] px-3 py-3 align-top">
                        {pageIds.length === 0 ? (
                          <Badge variant="muted" className="text-[11px]">
                            Toàn bộ Fanpage trong dự án
                          </Badge>
                        ) : (
                          <div className="space-y-1">
                            <span className="inline-block rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700">
                              {pageIds.length === 1
                                ? "1 Fanpage"
                                : `Gộp ${pageIds.length} Fanpage`}
                            </span>
                            <div className="flex flex-wrap gap-1">
                              {pageIds.slice(0, 3).map((pid) => (
                                <span
                                  key={pid}
                                  className="max-w-[190px] truncate rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-700"
                                  title={pageNameById.get(pid) ?? pid}
                                >
                                  {pageNameById.get(pid) ?? pid}
                                </span>
                              ))}
                              {pageIds.length > 3 && (
                                <span className="rounded bg-slate-200 px-1.5 py-0.5 text-[10px] font-medium text-slate-700">
                                  +{pageIds.length - 3} page
                                </span>
                              )}
                            </div>
                          </div>
                        )}
                      </td>

                      <td className="max-w-[200px] px-3 py-3 align-top">
                        <div className="flex flex-wrap gap-1">
                          {cats.length === 0 ? (
                            <span className="text-[11px] text-slate-500">Mọi phân loại</span>
                          ) : (
                            cats.map((c) => (
                              <span
                                key={c}
                                className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-800"
                              >
                                {CATEGORY_CHART_LABEL[c]}
                              </span>
                            ))
                          )}
                          {(seg.filters.dateFrom || seg.filters.dateTo) && (
                            <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                              {seg.filters.dateFrom || "…"} → {seg.filters.dateTo || "…"}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="px-3 py-3 text-right align-top">
                        <p className="text-sm font-bold text-slate-900">
                          {formatNumber(seg.liveUniqueContacts)}
                        </p>
                        <p className="text-[10px] text-slate-500">
                          {formatNumber(seg.liveValidPhones)} SĐT · {formatNumber(seg.liveRawLeads)} lead
                        </p>
                      </td>

                      <td className="max-w-[250px] px-3 py-3 align-top">
                        {seg.facebookAudienceId ? (
                          <div className="space-y-1">
                            <div className="flex items-center gap-1.5">
                              <Badge
                                variant={seg.lastSyncStatus === "error" ? "danger" : "success"}
                                className="gap-1 px-1.5 py-0 text-[10px]"
                              >
                                <CheckCircle2 className="size-3" />
                                {seg.lastSyncStatus === "error" ? "Lỗi đồng bộ" : "Đã đẩy Facebook"}
                              </Badge>
                              {cleanActId && (
                                <a
                                  href={`https://adsmanager.facebook.com/adsmanager/audiences?act=${cleanActId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[11px] font-medium text-primary hover:underline"
                                >
                                  Mở Ads Manager
                                  <ExternalLink className="size-2.5" />
                                </a>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-slate-600">
                              Audience ID: {seg.facebookAudienceId} ({seg.facebookAdAccountId})
                            </p>
                            {seg.lastSyncedAt && (
                              <p className="text-[10px] text-slate-500">
                                Đẩy lần cuối: {formatDateTime(seg.lastSyncedAt)} ({formatNumber(seg.lastSyncCount)} khách)
                              </p>
                            )}
                            {seg.lastSyncStatus === "error" && seg.lastSyncMessage && (
                              <p className="text-[10px] text-rose-600">{seg.lastSyncMessage}</p>
                            )}
                          </div>
                        ) : seg.lastSyncStatus === "error" ? (
                          <div className="space-y-1">
                            <Badge variant="danger" className="text-[10px]">
                              Chưa đẩy được
                            </Badge>
                            <p className="text-[10px] text-rose-600">{seg.lastSyncMessage}</p>
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Chưa đẩy lên Facebook
                          </span>
                        )}
                      </td>

                      <td className="px-3 py-3 text-right align-top">
                        <div className="flex flex-wrap items-center justify-end gap-1.5">
                          <Button
                            size="sm"
                            variant={seg.facebookAudienceId ? "outline" : "default"}
                            className="h-7 gap-1 px-2.5 text-[11px]"
                            disabled={isSyncing || seg.liveUniqueContacts === 0}
                            onClick={() => void handleSyncSegment(seg)}
                          >
                            {isSyncing ? (
                              <Loader2 className="size-3 animate-spin" />
                            ) : (
                              <CloudUpload className="size-3" />
                            )}
                            {seg.facebookAudienceId ? "Đồng bộ lại FB" : "Đẩy lên Facebook"}
                          </Button>

                          <div className="inline-flex rounded-md border border-slate-200 bg-white p-0.5">
                            <a
                              href={`/api/audiences/export?segmentId=${seg.id}&format=meta_csv`}
                              title="Tải CSV chuẩn Facebook Custom Audience"
                              className="rounded px-1.5 py-1 text-[10px] font-semibold text-blue-700 hover:bg-blue-50"
                            >
                              FB CSV
                            </a>
                            <a
                              href={`/api/audiences/export?segmentId=${seg.id}&format=google_csv`}
                              title="Tải CSV chuẩn Google Ads Customer Match"
                              className="rounded px-1.5 py-1 text-[10px] font-semibold text-amber-700 hover:bg-amber-50"
                            >
                              Google
                            </a>
                            <a
                              href={`/api/audiences/export?segmentId=${seg.id}&format=tiktok_csv`}
                              title="Tải CSV chuẩn TikTok Ads"
                              className="rounded px-1.5 py-1 text-[10px] font-semibold text-slate-800 hover:bg-slate-100"
                            >
                              TikTok
                            </a>
                            <a
                              href={`/api/audiences/export?segmentId=${seg.id}&format=zalo_txt`}
                              title="Tải danh sách SĐT (.txt) chuẩn Zalo Ads"
                              className="rounded px-1.5 py-1 text-[10px] font-semibold text-sky-700 hover:bg-sky-50"
                            >
                              Zalo
                            </a>
                          </div>

                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-7 px-1.5 text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                            title="Xóa tệp khách hàng"
                            onClick={() => setDeletingSegment(seg)}
                          >
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      <ConfirmDialog
        open={Boolean(deletingSegment)}
        onOpenChange={(open) => !open && setDeletingSegment(null)}
        title="Xóa tệp khách hàng"
        description={
          <>
            Bạn có chắc muốn xóa tệp <strong>«{deletingSegment?.name}»</strong> khỏi CRM? (Tệp đã tạo trên Facebook Ads Manager sẽ không bị xóa).
          </>
        }
        pending={deletingPending}
        onConfirm={async () => {
          if (!deletingSegment) return;
          setDeletingPending(true);
          try {
            const res = await deleteAudienceSegmentAction(deletingSegment.id);
            if (!res.ok) {
              toast.error("Không thể xóa tệp", res.error);
              return;
            }
            toast.success("Đã xóa tệp khách hàng.");
            setDeletingSegment(null);
            router.refresh();
          } finally {
            setDeletingPending(false);
          }
        }}
      />
    </div>
  );
}
