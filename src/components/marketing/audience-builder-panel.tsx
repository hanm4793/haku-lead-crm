"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import {
  CheckCircle2,
  ChevronDown,
  CloudUpload,
  Copy,
  Download,
  ExternalLink,
  Filter,
  Loader2,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";

import {
  createAudienceSegmentAction,
  deleteAudienceSegmentAction,
  listAdAccountsForAudienceAction,
  previewAudienceAction,
  syncAudienceToFacebookAction,
} from "@/app/marketing/audience-actions";
import {
  DateRangePicker,
  type PresetId,
} from "@/components/common/date-range-picker";
import { Pagination } from "@/components/common/pagination";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import {
  ensureCrmPrefix,
  stripCrmPrefix,
  type AudienceExportFormat,
} from "@/lib/audiences/customer-audience";
import {
  CATEGORY_CHART_LABEL,
  CHANNEL_DETAIL_OPTIONS,
  CHANNEL_LABEL,
  CONTACT_STATUS_LABEL,
  CONTACT_STATUS_OPTIONS,
  FAIL_REASON_OPTIONS,
} from "@/lib/constants";
import type {
  AudienceCampaignOption,
  AudiencePreviewResult,
  AudienceSegmentView,
} from "@/lib/db/audiences-repo";
import type { AudienceFilterConfig } from "@/lib/db/schema";
import type { AccessibleAdAccount } from "@/lib/facebook/custom-audiences";
import type {
  ChannelDetail,
  ContactStatus,
  FailReason,
  LeadCategory,
  LeadSource,
} from "@/lib/types";
import { cn, formatDate, formatDateTime, formatNumber } from "@/lib/utils";

export interface AudienceProjectOption {
  id: string;
  name: string;
}

export interface AudiencePageOption {
  id: string;
  name: string | null;
  projectId: string | null;
}

export interface AudienceBuilderPanelProps {
  activeProjectId: string | null;
  projects: AudienceProjectOption[];
  allPages: AudiencePageOption[];
  campaignOptions?: AudienceCampaignOption[];
  initialSegments: AudienceSegmentView[];
  defaultAdAccountId: string | null;
  tokenConfigured: boolean;
}

type SyncFilterStatus = "ALL" | "SYNCED" | "UNSYNCED" | "ERROR";

const LEAD_SOURCE_OPTIONS: Array<{ value: LeadSource; label: string }> = [
  { value: "FACEBOOK", label: "Facebook QC" },
  { value: "GOOGLE", label: "Google QC" },
  { value: "TIKTOK", label: "TikTok QC" },
  { value: "ZALO", label: "Zalo" },
  { value: "WEBSITE", label: "Website / Landing Page" },
  { value: "HOTLINE", label: "Hotline" },
  { value: "MANUAL", label: "Nhập tay / Import" },
];

const LEAD_SOURCE_LABEL: Record<LeadSource, string> = {
  FACEBOOK: "Facebook",
  GOOGLE: "Google",
  TIKTOK: "TikTok",
  ZALO: "Zalo",
  WEBSITE: "Website",
  HOTLINE: "Hotline",
  MANUAL: "Nhập tay",
};

const CATEGORY_SELECT_OPTIONS: Array<{ value: LeadCategory; label: string }> = [
  { value: "KHQT", label: CATEGORY_CHART_LABEL.KHQT },
  { value: "GDTD", label: CATEGORY_CHART_LABEL.GDTD },
  { value: "KHD", label: CATEGORY_CHART_LABEL.KHD },
  { value: "CHUA_LH_DUOC", label: CATEGORY_CHART_LABEL.CHUA_LH_DUOC },
  { value: "CHUA_PHAN_LOAI", label: CATEGORY_CHART_LABEL.CHUA_PHAN_LOAI },
  { value: "FAIL", label: CATEGORY_CHART_LABEL.FAIL },
];

const EXPORT_FORMAT_ITEMS: ReadonlyArray<{
  format: AudienceExportFormat;
  label: string;
}> = [
  { format: "meta_csv", label: "Facebook QC (.csv)" },
  { format: "google_csv", label: "Google QC (.csv)" },
  { format: "tiktok_csv", label: "TikTok QC (.csv)" },
  { format: "zalo_txt", label: "Zalo QC (.txt)" },
];

export function AudienceBuilderPanel({
  activeProjectId,
  projects,
  allPages,
  campaignOptions = [],
  initialSegments,
  defaultAdAccountId,
  tokenConfigured,
}: AudienceBuilderPanelProps) {
  const router = useRouter();
  const toast = useToast();

  // Bộ lọc danh sách tệp KH trên màn hình chính
  const [listSearch, setListSearch] = React.useState<string>("");
  const [listProjectIds, setListProjectIds] = React.useState<string[]>([]);
  const [listPageIds, setListPageIds] = React.useState<string[]>([]);
  const [listSyncStatus, setListSyncStatus] = React.useState<SyncFilterStatus>("ALL");

  // State Popup thêm tệp KH mới
  const [createOpen, setCreateOpen] = React.useState<boolean>(false);

  const [selectedProjectIds, setSelectedProjectIds] = React.useState<string[]>(
    activeProjectId ? [activeProjectId] : [],
  );
  const [selectedPageIds, setSelectedPageIds] = React.useState<string[]>([]);
  const [selectedCampaigns, setSelectedCampaigns] = React.useState<string[]>([]);
  const [channelDetails, setChannelDetails] = React.useState<ChannelDetail[]>([]);
  const [pageMode, setPageMode] = React.useState<"merge" | "split_by_page">("merge");
  const [categories, setCategories] = React.useState<LeadCategory[]>([]);
  const [contactStatuses, setContactStatuses] = React.useState<ContactStatus[]>([]);
  const [failReasons, setFailReasons] = React.useState<FailReason[]>([]);
  const [sources, setSources] = React.useState<LeadSource[]>([]);
  const [datePreset, setDatePreset] = React.useState<PresetId>("ALL");
  const [dateFrom, setDateFrom] = React.useState<string>("");
  const [dateTo, setDateTo] = React.useState<string>("");

  const [segmentName, setSegmentName] = React.useState<string>("CRM- Tệp KH");
  const [segmentDesc, setSegmentDesc] = React.useState<string>("");
  const [selectedAdAccountId, setSelectedAdAccountId] = React.useState<string>(
    defaultAdAccountId ?? "",
  );
  const [syncImmediately, setSyncImmediately] = React.useState<boolean>(tokenConfigured);

  const [adAccounts, setAdAccounts] = React.useState<AccessibleAdAccount[]>(
    defaultAdAccountId
      ? [
          {
            id: defaultAdAccountId.startsWith("act_")
              ? defaultAdAccountId
              : `act_${defaultAdAccountId}`,
            accountId: defaultAdAccountId.replace(/^act_/, ""),
            name: `TKQC Mặc định (${defaultAdAccountId})`,
            accountStatus: 1,
            currency: "VND",
            isDefault: true,
          },
        ]
      : [],
  );
  const [loadingAccounts, setLoadingAccounts] = React.useState<boolean>(false);
  const [preview, setPreview] = React.useState<AudiencePreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = React.useState<boolean>(false);
  const [creating, setCreating] = React.useState<boolean>(false);
  const [syncingId, setSyncingId] = React.useState<string | null>(null);
  const [exportingKey, setExportingKey] = React.useState<string | null>(null);
  const [deletingId, setDeletingId] = React.useState<string | null>(null);

  const [prevActiveProjectId, setPrevActiveProjectId] = React.useState(activeProjectId);
  if (activeProjectId !== prevActiveProjectId) {
    setPrevActiveProjectId(activeProjectId);
    setSelectedProjectIds(activeProjectId ? [activeProjectId] : []);
    setSelectedPageIds([]);
    setSelectedCampaigns([]);
  }

  const effectiveProjectId =
    selectedProjectIds.length === 1 ? selectedProjectIds[0]! : null;

  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const pageNameById = React.useMemo(
    () =>
      new Map(
        allPages.map((p) => [p.id, p.name?.trim() || `Fanpage ${p.id}`]),
      ),
    [allPages],
  );

  const projectSelectOptions = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const listPageSelectOptions = React.useMemo(() => {
    const pages =
      listProjectIds.length > 0
        ? allPages.filter(
            (p) => p.projectId && listProjectIds.includes(p.projectId),
          )
        : allPages;
    return pages.map((p) => ({
      value: p.id,
      label: p.name?.trim() || `Fanpage ${p.id}`,
    }));
  }, [allPages, listProjectIds]);

  const filteredSegments = React.useMemo(() => {
    const q = listSearch.trim().toLowerCase();
    return initialSegments.filter((seg) => {
      if (q) {
        const matchName = seg.name.toLowerCase().includes(q);
        const matchDesc = (seg.description ?? "").toLowerCase().includes(q);
        const matchAudId = (seg.facebookAudienceId ?? "").toLowerCase().includes(q);
        const matchProj = (seg.projectName ?? "").toLowerCase().includes(q);
        if (!matchName && !matchDesc && !matchAudId && !matchProj) return false;
      }

      if (listProjectIds.length > 0) {
        const segProjIds =
          seg.filters.projectIds && seg.filters.projectIds.length > 0
            ? seg.filters.projectIds
            : seg.projectId
              ? [seg.projectId]
              : [];
        if (!segProjIds.some((id) => listProjectIds.includes(id))) {
          return false;
        }
      }

      if (listPageIds.length > 0) {
        const segPageIds = seg.filters.facebookPageIds ?? [];
        if (!segPageIds.some((id) => listPageIds.includes(id))) {
          return false;
        }
      }

      if (listSyncStatus === "SYNCED") {
        if (!(seg.lastSyncStatus === "ok" && seg.facebookAudienceId)) return false;
      } else if (listSyncStatus === "ERROR") {
        if (seg.lastSyncStatus !== "error") return false;
      } else if (listSyncStatus === "UNSYNCED") {
        if (seg.lastSyncStatus === "ok" || seg.lastSyncStatus === "error") return false;
      }

      return true;
    });
  }, [initialSegments, listSearch, listProjectIds, listPageIds, listSyncStatus]);

  const [listPage, setListPage] = React.useState(1);
  const AUDIENCE_PAGE_SIZE = 10;
  const listPageCount = Math.max(1, Math.ceil(filteredSegments.length / AUDIENCE_PAGE_SIZE));
  const safeListPage = Math.min(listPage, listPageCount);
  const pagedSegments = filteredSegments.slice(
    (safeListPage - 1) * AUDIENCE_PAGE_SIZE,
    safeListPage * AUDIENCE_PAGE_SIZE,
  );

  const hasListFilters =
    Boolean(listSearch.trim()) ||
    listProjectIds.length > 0 ||
    listPageIds.length > 0 ||
    listSyncStatus !== "ALL";

  const clearListFilters = () => {
    setListSearch("");
    setListProjectIds([]);
    setListPageIds([]);
    setListSyncStatus("ALL");
    setListPage(1);
  };

  const scopedPages = React.useMemo(
    () =>
      selectedProjectIds.length > 0
        ? allPages.filter(
            (p) => p.projectId && selectedProjectIds.includes(p.projectId),
          )
        : allPages,
    [allPages, selectedProjectIds],
  );

  const pageSelectOptions = React.useMemo(
    () =>
      scopedPages.map((p) => {
        const pageLabel = p.name?.trim() || `Fanpage ${p.id}`;
        const projLabel =
          selectedProjectIds.length !== 1 && p.projectId
            ? projectNameById.get(p.projectId)
            : null;
        return {
          value: p.id,
          label: projLabel ? `${pageLabel} (${projLabel})` : pageLabel,
        };
      }),
    [scopedPages, selectedProjectIds.length, projectNameById],
  );

  const scopedCampaignOptions = React.useMemo(() => {
    if (selectedPageIds.length > 0) {
      const selectedPageSet = new Set(selectedPageIds);
      return campaignOptions.filter((c) =>
        (c.pageIds ?? []).some((id) => selectedPageSet.has(id)),
      );
    }
    if (selectedProjectIds.length > 0) {
      const selectedProjSet = new Set(selectedProjectIds);
      const allowedPageSet = new Set(scopedPages.map((p) => p.id));
      return campaignOptions.filter(
        (c) =>
          (c.projectIds ?? []).some((id) => selectedProjSet.has(id)) ||
          (c.pageIds ?? []).some((id) => allowedPageSet.has(id)),
      );
    }
    return campaignOptions;
  }, [campaignOptions, selectedPageIds, selectedProjectIds, scopedPages]);

  const campaignSelectOptions = React.useMemo(
    () =>
      scopedCampaignOptions.map((c) => {
        const scopedCount =
          selectedPageIds.length > 0 && c.countsByPage
            ? selectedPageIds.reduce(
                (sum, pageId) => sum + (c.countsByPage?.[pageId] ?? 0),
                0,
              )
            : c.count;
        return {
          value: c.name,
          label:
            scopedCount > 0 ? `${c.name} (${scopedCount} lead)` : c.name,
        };
      }),
    [scopedCampaignOptions, selectedPageIds],
  );

  const adAccountsLoadedRef = React.useRef(false);

  const loadAdAccounts = React.useCallback(async () => {
    if (!tokenConfigured) return;
    setLoadingAccounts(true);
    try {
      const res = await listAdAccountsForAudienceAction();
      if (res.ok && res.accounts.length > 0) {
        adAccountsLoadedRef.current = true;
        setAdAccounts(res.accounts);
        setSelectedAdAccountId((prev) => prev || res.accounts[0]?.id || "");
      }
    } finally {
      setLoadingAccounts(false);
    }
  }, [tokenConfigured]);

  React.useEffect(() => {
    if (!tokenConfigured || !createOpen || adAccountsLoadedRef.current) return;
    adAccountsLoadedRef.current = true;
    let cancelled = false;
    void listAdAccountsForAudienceAction().then((res) => {
      if (!cancelled && res.ok && res.accounts.length > 0) {
        setAdAccounts(res.accounts);
        setSelectedAdAccountId((prev) => prev || res.accounts[0]?.id || "");
      }
    });
    return () => {
      cancelled = true;
    };
  }, [tokenConfigured, createOpen]);

  const currentFilters: AudienceFilterConfig = React.useMemo(
    () => ({
      projectIds: selectedProjectIds,
      facebookPageIds: selectedPageIds,
      campaigns: selectedCampaigns,
      channelDetails,
      categories,
      contactStatuses,
      failReasons,
      sources,
      dateFrom: dateFrom || null,
      dateTo: dateTo || null,
    }),
    [
      selectedProjectIds,
      selectedPageIds,
      selectedCampaigns,
      channelDetails,
      categories,
      contactStatuses,
      failReasons,
      sources,
      dateFrom,
      dateTo,
    ],
  );

  React.useEffect(() => {
    if (!createOpen) return;
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
  }, [createOpen, effectiveProjectId, currentFilters]);

  const generateSuggestedName = React.useCallback(
    (
      nextPageIds = selectedPageIds,
      nextCampaigns = selectedCampaigns,
      nextCategories = categories,
    ) => {
      const parts: string[] = [];
      if (nextPageIds.length === 1) {
        parts.push(pageNameById.get(nextPageIds[0]!) ?? "1 Fanpage");
      } else if (nextPageIds.length > 1) {
        parts.push(`${nextPageIds.length} Fanpage`);
      } else if (selectedProjectIds.length === 1) {
        parts.push(projectNameById.get(selectedProjectIds[0]!) ?? "Dự án");
      } else if (selectedProjectIds.length > 1) {
        parts.push(`${selectedProjectIds.length} Dự án`);
      }

      if (nextCampaigns.length === 1) {
        parts.push(nextCampaigns[0]!);
      } else if (nextCampaigns.length > 1) {
        parts.push(`${nextCampaigns.length} chiến dịch`);
      }

      if (nextCategories.length > 0) {
        parts.push(
          nextCategories.map((c) => CATEGORY_CHART_LABEL[c] ?? c).join(", "),
        );
      } else {
        parts.push("Tệp KH");
      }

      return ensureCrmPrefix(parts.join(" - "));
    },
    [
      selectedPageIds,
      selectedCampaigns,
      categories,
      selectedProjectIds,
      pageNameById,
      projectNameById,
    ],
  );

  const resetBuilderFilters = React.useCallback(() => {
    const defaultProjIds = activeProjectId ? [activeProjectId] : [];
    setSelectedProjectIds(defaultProjIds);
    setSelectedPageIds([]);
    setSelectedCampaigns([]);
    setChannelDetails([]);
    setCategories([]);
    setContactStatuses([]);
    setFailReasons([]);
    setSources([]);
    setDatePreset("ALL");
    setDateFrom("");
    setDateTo("");
    setPageMode("merge");
    const defaultProjName =
      defaultProjIds.length === 1
        ? projectNameById.get(defaultProjIds[0]!)
        : null;
    setSegmentName(
      ensureCrmPrefix(
        defaultProjName ? `${defaultProjName} - Tệp KH` : "Tệp KH",
      ),
    );
    setSegmentDesc("");
  }, [activeProjectId, projectNameById]);

  const handleOpenCreateModal = () => {
    resetBuilderFilters();
    setCreateOpen(true);
  };

  const loadSegmentIntoBuilder = (seg: AudienceSegmentView) => {
    const f = seg.filters ?? {};
    const nextProjIds =
      f.projectIds && f.projectIds.length > 0
        ? f.projectIds
        : seg.projectId
          ? [seg.projectId]
          : [];
    setSelectedProjectIds(nextProjIds);
    setSelectedPageIds(f.facebookPageIds ?? []);
    setSelectedCampaigns(f.campaigns ?? []);
    setChannelDetails(f.channelDetails ?? []);
    setCategories(f.categories ?? []);
    setContactStatuses(f.contactStatuses ?? []);
    setFailReasons(f.failReasons ?? []);
    setSources(f.sources ?? []);
    setDatePreset(f.dateFrom || f.dateTo ? "CUSTOM" : "ALL");
    setDateFrom(f.dateFrom ?? "");
    setDateTo(f.dateTo ?? "");
    setPageMode("merge");
    setSegmentName(ensureCrmPrefix(seg.name));
    setSegmentDesc(seg.description ?? "");
    if (seg.facebookAdAccountId) {
      setSelectedAdAccountId(seg.facebookAdAccountId);
    }
    setCreateOpen(true);
  };

  const handleCreateAndSync = async () => {
    const cleanCore = stripCrmPrefix(segmentName);
    if (!cleanCore) {
      toast.error("Vui lòng nhập tên tệp KH.");
      return;
    }

    setCreating(true);
    try {
      const res = await createAudienceSegmentAction({
        name: ensureCrmPrefix(cleanCore),
        description: segmentDesc.trim() || null,
        projectId: effectiveProjectId,
        filters: currentFilters,
        facebookAdAccountId: selectedAdAccountId || null,
        mode: selectedPageIds.length > 1 ? pageMode : "merge",
        syncImmediately: syncImmediately && tokenConfigured,
      });

      if (!res.ok) {
        toast.error("Không thể tạo tệp KH", res.error);
        return;
      }

      if (res.syncError) {
        toast.warning(
          `Đã lưu ${res.count} tệp nhưng đồng bộ TKQC gặp lỗi`,
          res.syncError,
        );
      } else if (res.syncedCount > 0) {
        toast.success(
          `Đã tạo & đồng bộ ${res.syncedCount} tệp KH lên TKQC!`,
          `Tệp "${ensureCrmPrefix(cleanCore)}" (${selectedAdAccountId}).`,
        );
      } else {
        toast.success(`Đã lưu ${res.count} tệp KH.`);
      }

      setCreateOpen(false);
      router.refresh();
    } finally {
      setCreating(false);
    }
  };

  const handleSyncSegment = async (seg: AudienceSegmentView) => {
    setSyncingId(seg.id);
    try {
      const res = await syncAudienceToFacebookAction({
        segmentId: seg.id,
        adAccountId: seg.facebookAdAccountId || selectedAdAccountId || null,
      });
      if (!res.ok) {
        toast.error("Đồng bộ TKQC thất bại", res.error);
        router.refresh();
        return;
      }

      toast.success(
        `Đã đồng bộ "${ensureCrmPrefix(seg.name)}" lên TKQC!`,
        `ID: ${res.result.audienceId} (${formatNumber(res.result.uploadedCount)} KH).`,
      );
      router.refresh();
    } finally {
      setSyncingId(null);
    }
  };

  const handleExport = async (
    format: AudienceExportFormat,
    segment?: AudienceSegmentView,
  ) => {
    const key = `${segment?.id ?? "builder"}_${format}`;
    setExportingKey(key);
    try {
      let response: Response;
      if (segment) {
        response = await fetch(
          `/api/audiences/export?segmentId=${encodeURIComponent(segment.id)}&format=${encodeURIComponent(format)}`,
        );
      } else {
        response = await fetch("/api/audiences/export", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            name: ensureCrmPrefix(segmentName),
            projectId: effectiveProjectId,
            filters: currentFilters,
            format,
          }),
        });
      }

      if (!response.ok) {
        toast.error("Xuất tệp KH thất bại.");
        return;
      }

      const blob = await response.blob();
      const disposition = response.headers.get("Content-Disposition") ?? "";
      const match = /filename="([^"]+)"/.exec(disposition);
      const filename = match?.[1] ?? `crm-audience-${format}.csv`;

      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success(`Đã tải ${filename}`);
    } finally {
      setExportingKey(null);
    }
  };

  const handleDelete = async (seg: AudienceSegmentView) => {
    if (
      !window.confirm(
        `Xoá tệp "${seg.name}" khỏi CRM? (Tệp đã đồng bộ trên TKQC vẫn giữ nguyên)`,
      )
    ) {
      return;
    }
    setDeletingId(seg.id);
    try {
      const res = await deleteAudienceSegmentAction(seg.id);
      if (!res.ok) {
        toast.error("Xoá tệp thất bại", res.error);
        return;
      }
      toast.success(`Đã xoá "${seg.name}".`);
      router.refresh();
    } finally {
      setDeletingId(null);
    }
  };

  const activeBuilderFilterCount =
    selectedProjectIds.length +
    selectedPageIds.length +
    selectedCampaigns.length +
    categories.length +
    contactStatuses.length +
    sources.length +
    channelDetails.length +
    failReasons.length +
    (dateFrom ? 1 : 0) +
    (dateTo ? 1 : 0);

  return (
    <>
      {/* DANH SÁCH TỆP KHÁCH HÀNG */}
      <div className="flex flex-col overflow-hidden rounded-xl border border-border bg-card shadow-xs">
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          <div className="relative w-60">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={listSearch}
              onChange={(e) => setListSearch(e.target.value)}
              placeholder="Tìm tên tệp, ghi chú, ID..."
              className="h-8 pl-8 text-[13px]"
            />
          </div>

          {projects.length > 0 && (
            <MultiSelect
              options={projectSelectOptions}
              selected={listProjectIds}
              onChange={(nextProjIds) => {
                setListProjectIds(nextProjIds);
                if (nextProjIds.length > 0) {
                  const allowed = new Set(
                    allPages
                      .filter(
                        (p) => p.projectId && nextProjIds.includes(p.projectId),
                      )
                      .map((p) => p.id),
                  );
                  setListPageIds((prev) => prev.filter((id) => allowed.has(id)));
                }
              }}
              placeholder="Tất cả dự án"
              className="h-8 w-[170px] text-[13px]"
              contentClassName="w-[240px]"
            />
          )}

          <MultiSelect
            options={listPageSelectOptions}
            selected={listPageIds}
            onChange={setListPageIds}
            placeholder="Tất cả fanpage"
            className="h-8 w-[190px] text-[13px]"
            contentClassName="w-[280px]"
          />

          <Select
            value={listSyncStatus}
            onValueChange={(val) => setListSyncStatus(val as SyncFilterStatus)}
          >
            <SelectTrigger className="h-8 w-[160px] text-[13px]">
              <SelectValue placeholder="Trạng thái" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">
                Tất cả trạng thái
              </SelectItem>
              <SelectItem value="SYNCED" className="text-xs">
                Đã đồng bộ
              </SelectItem>
              <SelectItem value="UNSYNCED" className="text-xs">
                Chưa đồng bộ
              </SelectItem>
              <SelectItem value="ERROR" className="text-xs">
                Lỗi đồng bộ
              </SelectItem>
            </SelectContent>
          </Select>

          {hasListFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={clearListFilters}
              className="h-8 gap-1 px-2 text-xs text-rose-600 hover:bg-rose-50 hover:text-rose-700"
            >
              <X className="size-3.5" />
              Xóa lọc
            </Button>
          )}

          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-muted-foreground tabular-nums">
              <strong>{filteredSegments.length}</strong>/{initialSegments.length} tệp
            </span>

            <Button
              type="button"
              size="sm"
              className="gap-1.5"
              onClick={handleOpenCreateModal}
            >
              <Plus className="size-3.5" />
              Thêm tệp KH
            </Button>
          </div>
        </div>

        {initialSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
            <div className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
              <Users className="size-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-900">
                Chưa có tệp KH nào
              </p>
              <p className="max-w-sm text-xs text-muted-foreground">
                Lọc dữ liệu KH từ CRM và đồng bộ tệp (CRM-) lên TKQC.
              </p>
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-1 gap-1.5"
              onClick={handleOpenCreateModal}
            >
              <Plus className="size-3.5" />
              Thêm tệp KH
            </Button>
          </div>
        ) : filteredSegments.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
            <p className="text-sm font-medium text-slate-700">
              Không có tệp KH khớp bộ lọc
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={clearListFilters}
              className="mt-1 gap-1.5 text-xs"
            >
              <RotateCcw className="size-3.5" />
              Xóa lọc
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-border bg-slate-50/80 text-[11px] font-semibold uppercase tracking-wide text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Tên tệp & Ghi chú</th>
                  <th className="px-3.5 py-2.5">Dự án & Fanpage</th>
                  <th className="px-3.5 py-2.5">Bộ lọc</th>
                  <th className="px-3.5 py-2.5 text-right">Quy mô KH</th>
                  <th className="px-3.5 py-2.5">Đồng bộ TKQC</th>
                  <th className="px-3.5 py-2.5">Ngày tạo</th>
                  <th className="px-4 py-2.5 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/70">
                {pagedSegments.map((seg) => {
                  const pageIds = seg.filters.facebookPageIds ?? [];
                  const filterProjIds = seg.filters.projectIds ?? [];
                  const filterCampaigns = seg.filters.campaigns ?? [];
                  const filterCats = seg.filters.categories ?? [];
                  const filterStatuses = seg.filters.contactStatuses ?? [];
                  const filterSources = seg.filters.sources ?? [];
                  const filterChannels = seg.filters.channelDetails ?? [];
                  const hasDateRange = Boolean(
                    seg.filters.dateFrom || seg.filters.dateTo,
                  );
                  const isSyncing = syncingId === seg.id;
                  const isExportingRow = EXPORT_FORMAT_ITEMS.some(
                    (it) => exportingKey === `${seg.id}_${it.format}`,
                  );
                  const cleanActId =
                    seg.facebookAdAccountId?.replace(/^act_/, "") ?? "";

                  const projectBadgeLabel =
                    filterProjIds.length > 1
                      ? `${filterProjIds.length} dự án`
                      : filterProjIds.length === 1
                        ? (projectNameById.get(filterProjIds[0]!) ??
                          seg.projectName ??
                          "1 dự án")
                        : (seg.projectName ?? "Tất cả dự án");

                  const hasAnyCriteria =
                    filterCampaigns.length > 0 ||
                    filterCats.length > 0 ||
                    filterStatuses.length > 0 ||
                    filterSources.length > 0 ||
                    filterChannels.length > 0 ||
                    hasDateRange;

                  return (
                    <tr key={seg.id} className="transition hover:bg-slate-50/80">
                      <td className="max-w-[240px] px-4 py-3 align-top">
                        <button
                          type="button"
                          onClick={() => loadSegmentIntoBuilder(seg)}
                          className="text-left font-bold text-slate-900 hover:text-primary hover:underline"
                          title="Mở cấu hình tệp này"
                        >
                          {ensureCrmPrefix(seg.name)}
                        </button>
                        {seg.description && (
                          <p className="mt-0.5 line-clamp-1 text-[11px] text-slate-500">
                            {seg.description}
                          </p>
                        )}
                      </td>

                      <td className="max-w-[220px] px-3.5 py-3 align-top">
                        <div className="flex flex-wrap items-center gap-1">
                          <Badge variant="outline" className="px-1.5 py-0 text-[10px]">
                            {projectBadgeLabel}
                          </Badge>
                          {pageIds.length === 0 ? (
                            <Badge variant="muted" className="text-[10px]">
                              Tất cả Fanpage
                            </Badge>
                          ) : (
                            pageIds.slice(0, 2).map((pid) => (
                              <span
                                key={pid}
                                className="max-w-[160px] truncate rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-medium text-blue-800"
                              >
                                {pageNameById.get(pid) ?? pid}
                              </span>
                            ))
                          )}
                          {pageIds.length > 2 && (
                            <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-medium text-blue-800">
                              +{pageIds.length - 2}
                            </span>
                          )}
                        </div>
                      </td>

                      <td className="max-w-[260px] px-3.5 py-3 align-top">
                        {!hasAnyCriteria ? (
                          <span className="text-[11px] text-slate-500">
                            Tất cả KH hợp lệ
                          </span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {filterCampaigns.length > 0 && (
                              <span
                                className="max-w-[190px] truncate rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-medium text-amber-800"
                                title={filterCampaigns.join(", ")}
                              >
                                {filterCampaigns.length === 1
                                  ? filterCampaigns[0]
                                  : `${filterCampaigns.length} chiến dịch`}
                              </span>
                            )}
                            {filterCats.map((cat) => (
                              <span
                                key={cat}
                                className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-medium text-slate-700"
                              >
                                {CATEGORY_CHART_LABEL[cat] ?? cat}
                              </span>
                            ))}
                            {filterStatuses.map((st) => (
                              <span
                                key={st}
                                className="rounded bg-indigo-50 px-1.5 py-0.5 text-[10px] font-medium text-indigo-800"
                              >
                                {CONTACT_STATUS_LABEL[st] ?? st}
                              </span>
                            ))}
                            {filterSources.map((src) => (
                              <span
                                key={src}
                                className="rounded bg-purple-50 px-1.5 py-0.5 text-[10px] font-medium text-purple-800"
                              >
                                {LEAD_SOURCE_LABEL[src] ?? src}
                              </span>
                            ))}
                            {filterChannels.map((ch) => (
                              <span
                                key={ch}
                                className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-medium text-teal-800"
                              >
                                {CHANNEL_LABEL[ch] ?? ch}
                              </span>
                            ))}
                            {hasDateRange && (
                              <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">
                                {seg.filters.dateFrom
                                  ? formatDate(seg.filters.dateFrom)
                                  : "..."}{" "}
                                →{" "}
                                {seg.filters.dateTo
                                  ? formatDate(seg.filters.dateTo)
                                  : "nay"}
                              </span>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="px-3.5 py-3 text-right align-top tabular-nums">
                        <span className="text-sm font-extrabold text-emerald-700">
                          {formatNumber(seg.liveUniqueContacts)}
                        </span>
                        <span className="ml-1 text-[11px] text-slate-500">SĐT</span>
                        <p className="text-[11px] text-slate-500">
                          {formatNumber(seg.liveRawLeads)} lead
                          {seg.liveValidEmails > 0
                            ? ` · ${formatNumber(seg.liveValidEmails)} email`
                            : ""}
                        </p>
                      </td>

                      <td className="max-w-[240px] px-3.5 py-3 align-top">
                        {seg.lastSyncStatus === "ok" && seg.facebookAudienceId ? (
                          <div className="space-y-0.5">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10px] font-semibold text-emerald-800">
                                <CheckCircle2 className="size-3" />
                                Đã đồng bộ
                              </span>
                              {cleanActId && (
                                <a
                                  href={`https://adsmanager.facebook.com/adsmanager/audiences?act=${cleanActId}`}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-primary hover:underline"
                                >
                                  Mở TKQC
                                  <ExternalLink className="size-2.5" />
                                </a>
                              )}
                            </div>
                            <p className="font-mono text-[10px] text-slate-500">
                              ID: {seg.facebookAudienceId}
                            </p>
                          </div>
                        ) : seg.lastSyncStatus === "error" ? (
                          <div className="space-y-0.5">
                            <Badge variant="danger" className="text-[10px]">
                              Lỗi đồng bộ
                            </Badge>
                            {seg.lastSyncMessage && (
                              <p
                                className="line-clamp-2 text-[11px] text-red-600"
                                title={seg.lastSyncMessage}
                              >
                                {seg.lastSyncMessage}
                              </p>
                            )}
                          </div>
                        ) : (
                          <span className="text-[11px] text-slate-400">
                            Chưa đồng bộ
                          </span>
                        )}
                      </td>

                      <td className="whitespace-nowrap px-3.5 py-3 align-top text-[11px] text-slate-500">
                        {formatDateTime(seg.createdAt)}
                      </td>

                      <td className="px-4 py-3 text-right align-top">
                        <div className="flex items-center justify-end gap-1.5">
                          {tokenConfigured && (
                            <Button
                              type="button"
                              size="xs"
                              variant="outline"
                              disabled={isSyncing}
                              onClick={() => void handleSyncSegment(seg)}
                              className="gap-1"
                            >
                              {isSyncing ? (
                                <Loader2 className="size-3 animate-spin" />
                              ) : (
                                <CloudUpload className="size-3 text-primary" />
                              )}
                              Đồng bộ
                            </Button>
                          )}

                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button
                                type="button"
                                size="xs"
                                variant="outline"
                                disabled={isExportingRow}
                                className="gap-1"
                              >
                                {isExportingRow ? (
                                  <Loader2 className="size-3 animate-spin" />
                                ) : (
                                  <Download className="size-3 text-slate-600" />
                                )}
                                Xuất file
                                <ChevronDown className="size-3 opacity-60" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                              {EXPORT_FORMAT_ITEMS.map((item) => (
                                <DropdownMenuItem
                                  key={item.format}
                                  onSelect={() => void handleExport(item.format, seg)}
                                  className="gap-2 text-xs"
                                >
                                  <Download className="size-3.5 text-slate-500" />
                                  {item.label}
                                </DropdownMenuItem>
                              ))}
                            </DropdownMenuContent>
                          </DropdownMenu>

                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            onClick={() => loadSegmentIntoBuilder(seg)}
                            title="Tạo tệp mới từ cấu hình này"
                            className="px-1.5 text-slate-500 hover:text-slate-900"
                          >
                            <Copy className="size-3.5" />
                          </Button>

                          <Button
                            type="button"
                            size="xs"
                            variant="ghost"
                            disabled={deletingId === seg.id}
                            onClick={() => void handleDelete(seg)}
                            title="Xoá tệp"
                            className="px-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
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
            <Pagination
              page={safeListPage}
              pageSize={AUDIENCE_PAGE_SIZE}
              total={filteredSegments.length}
              unit="tệp KH"
              onPageChange={setListPage}
            />
          </div>
        )}
      </div>

      {/* POPUP THÊM TỆP KHÁCH HÀNG MỚI (LAYOUT 1 CỘT RỘNG RÃI GIỐNG CREATE LEAD DIALOG) */}
      <Dialog
        open={createOpen}
        onOpenChange={(next) => {
          if (creating) return;
          setCreateOpen(next);
        }}
      >
        <DialogContent className="flex max-h-[90vh] w-[95vw] max-w-3xl flex-col gap-0 overflow-hidden p-0">
          <DialogHeader className="shrink-0 border-b border-border px-6 py-4">
            <DialogTitle className="text-lg font-bold">
              Thêm tệp KH mới
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              Lọc KH từ CRM và đồng bộ tệp mới (tiền tố{" "}
              <code className="font-bold text-primary">CRM-</code>) lên TKQC.
            </DialogDescription>
          </DialogHeader>

          <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto p-6">
            {/* THANH TÓM TẮT QUY MÔ KH HỢP LỆ (XEM TRƯỚC) */}
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-emerald-200 bg-emerald-50/60 px-4 py-3">
              <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
                <span className="text-xs font-semibold text-emerald-950">
                  Quy mô tệp:
                </span>
                <span className="text-lg font-extrabold leading-none text-emerald-700 tabular-nums">
                  {preview ? formatNumber(preview.stats.uniqueContacts) : "—"}
                </span>
                <span className="text-xs font-medium text-emerald-800">
                  SĐT hợp lệ
                </span>
                <span className="text-xs text-emerald-800/80 tabular-nums">
                  ({preview ? formatNumber(preview.stats.totalMatchedLeads) : 0}{" "}
                  lead · {preview ? formatNumber(preview.stats.validEmails) : 0}{" "}
                  email)
                </span>
                {previewLoading && (
                  <Loader2 className="size-3.5 animate-spin self-center text-emerald-700" />
                )}
              </div>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    type="button"
                    variant="outline"
                    size="xs"
                    disabled={(preview?.stats.uniqueContacts ?? 0) === 0}
                    className="gap-1 bg-white"
                  >
                    <Download className="size-3 text-slate-600" />
                    Xuất file (.CSV/.TXT)
                    <ChevronDown className="size-3 opacity-60" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  {EXPORT_FORMAT_ITEMS.map((item) => (
                    <DropdownMenuItem
                      key={item.format}
                      onSelect={() => void handleExport(item.format)}
                      className="gap-2 text-xs"
                    >
                      <Download className="size-3.5 text-slate-500" />
                      {item.label}
                    </DropdownMenuItem>
                  ))}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>

            {/* KHỐI 1: BỘ LỌC NGUỒN & KHÁCH HÀNG */}
            <div className="rounded-lg border border-border bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Filter className="size-3.5 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    1. Bộ lọc nguồn & KH
                  </span>
                  {activeBuilderFilterCount > 0 && (
                    <Badge variant="secondary" className="px-1.5 py-0 text-[10px]">
                      {activeBuilderFilterCount}
                    </Badge>
                  )}
                </div>
                <button
                  type="button"
                  onClick={resetBuilderFilters}
                  className="inline-flex items-center gap-1 text-xs font-medium text-slate-600 hover:text-primary"
                >
                  <RotateCcw className="size-3" />
                  Đặt lại
                </button>
              </div>

              <div className="space-y-3.5">
                {/* DỰ ÁN & FANPAGE */}
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">Dự án</Label>
                      {selectedProjectIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProjectIds([]);
                            setSelectedPageIds([]);
                          }}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Tất cả
                        </button>
                      )}
                    </div>
                    <MultiSelect
                      options={projectSelectOptions}
                      selected={selectedProjectIds}
                      onChange={(nextProjIds) => {
                        setSelectedProjectIds(nextProjIds);
                        let nextPages = selectedPageIds;
                        if (nextProjIds.length > 0) {
                          const allowedPageIds = new Set(
                            allPages
                              .filter(
                                (p) =>
                                  p.projectId &&
                                  nextProjIds.includes(p.projectId),
                              )
                              .map((p) => p.id),
                          );
                          nextPages = selectedPageIds.filter((id) =>
                            allowedPageIds.has(id),
                          );
                          setSelectedPageIds(nextPages);

                          const allowedCampaigns = new Set(
                            campaignOptions
                              .filter((c) =>
                                nextPages.length > 0
                                  ? (c.pageIds ?? []).some((id) =>
                                      nextPages.includes(id),
                                    )
                                  : (c.projectIds ?? []).some((id) =>
                                      nextProjIds.includes(id),
                                    ) ||
                                    (c.pageIds ?? []).some((id) =>
                                      allowedPageIds.has(id),
                                    ),
                              )
                              .map((c) => c.name),
                          );
                          setSelectedCampaigns((prev) =>
                            prev.filter((name) => allowedCampaigns.has(name)),
                          );
                        }
                      }}
                      placeholder="Tất cả dự án"
                      className="w-full bg-white"
                      contentClassName="w-[320px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Fanpage ({scopedPages.length})
                      </Label>
                      {selectedPageIds.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedPageIds([]);
                            setSegmentName(
                              generateSuggestedName(
                                [],
                                selectedCampaigns,
                                categories,
                              ),
                            );
                          }}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Bỏ chọn ({selectedPageIds.length})
                        </button>
                      )}
                    </div>
                    <MultiSelect
                      options={pageSelectOptions}
                      selected={selectedPageIds}
                      onChange={(nextIds) => {
                        setSelectedPageIds(nextIds);
                        let nextCampaigns = selectedCampaigns;
                        if (nextIds.length > 0) {
                          const nextIdSet = new Set(nextIds);
                          const allowedCampaignNames = new Set(
                            campaignOptions
                              .filter((c) =>
                                (c.pageIds ?? []).some((id) =>
                                  nextIdSet.has(id),
                                ),
                              )
                              .map((c) => c.name),
                          );
                          nextCampaigns = selectedCampaigns.filter((name) =>
                            allowedCampaignNames.has(name),
                          );
                          setSelectedCampaigns(nextCampaigns);
                        }
                        setSegmentName(
                          generateSuggestedName(
                            nextIds,
                            nextCampaigns,
                            categories,
                          ),
                        );
                      }}
                      placeholder="Tất cả Fanpage"
                      className="w-full bg-white"
                      contentClassName="w-[320px]"
                    />
                  </div>
                </div>

                {selectedPageIds.length > 1 && (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-blue-200 bg-blue-50/60 px-3 py-2 text-xs">
                    <span className="font-medium text-slate-700">
                      Đã chọn <strong>{selectedPageIds.length} Fanpage</strong>:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setPageMode("merge")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-semibold transition",
                          pageMode === "merge"
                            ? "bg-primary text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        Gộp 1 tệp
                      </button>
                      <button
                        type="button"
                        onClick={() => setPageMode("split_by_page")}
                        className={cn(
                          "rounded px-2.5 py-1 text-xs font-semibold transition",
                          pageMode === "split_by_page"
                            ? "bg-primary text-white"
                            : "bg-white text-slate-700 hover:bg-slate-100",
                        )}
                      >
                        Tách {selectedPageIds.length} tệp theo Fanpage
                      </button>
                    </div>
                  </div>
                )}

                {/* CHIẾN DỊCH QC & PHÂN LOẠI KH */}
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <Label className="text-xs font-medium">
                        Chiến dịch QC ({scopedCampaignOptions.length})
                      </Label>
                      {selectedCampaigns.length > 0 && (
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCampaigns([]);
                            setSegmentName(
                              generateSuggestedName(
                                selectedPageIds,
                                [],
                                categories,
                              ),
                            );
                          }}
                          className="text-[11px] font-medium text-primary hover:underline"
                        >
                          Bỏ chọn ({selectedCampaigns.length})
                        </button>
                      )}
                    </div>
                    <MultiSelect
                      options={campaignSelectOptions}
                      selected={selectedCampaigns}
                      onChange={(nextCampaigns) => {
                        setSelectedCampaigns(nextCampaigns);
                        setSegmentName(
                          generateSuggestedName(
                            selectedPageIds,
                            nextCampaigns,
                            categories,
                          ),
                        );
                      }}
                      placeholder={`Tất cả chiến dịch (${scopedCampaignOptions.length})`}
                      className="w-full bg-white"
                      contentClassName="w-[340px]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Phân loại KH</Label>
                    <MultiSelect
                      options={CATEGORY_SELECT_OPTIONS}
                      selected={categories}
                      onChange={(vals) => {
                        const nextCats = vals as LeadCategory[];
                        setCategories(nextCats);
                        if (!nextCats.includes("FAIL")) {
                          setFailReasons([]);
                        }
                        setSegmentName(
                          generateSuggestedName(
                            selectedPageIds,
                            selectedCampaigns,
                            nextCats,
                          ),
                        );
                      }}
                      placeholder="Tất cả phân loại"
                      className="w-full bg-white"
                    />
                  </div>
                </div>

                {/* TRẠNG THÁI LIÊN HỆ & NGÀY TẠO LEAD */}
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">
                      Trạng thái liên hệ
                    </Label>
                    <MultiSelect
                      options={CONTACT_STATUS_OPTIONS}
                      selected={contactStatuses}
                      onChange={(vals) =>
                        setContactStatuses(vals as ContactStatus[])
                      }
                      placeholder="Tất cả trạng thái"
                      className="w-full bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Ngày tạo Lead</Label>
                    <DateRangePicker
                      preset={datePreset}
                      range={{ from: dateFrom || null, to: dateTo || null }}
                      onChange={(nextPreset, nextRange) => {
                        setDatePreset(nextPreset);
                        setDateFrom(nextRange.from ?? "");
                        setDateTo(nextRange.to ?? "");
                      }}
                      className="h-9 w-full justify-start bg-white text-xs"
                    />
                  </div>
                </div>

                {/* NGUỒN LEAD & KÊNH TƯƠNG TÁC */}
                <div className="grid gap-3.5 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Nguồn Lead</Label>
                    <MultiSelect
                      options={LEAD_SOURCE_OPTIONS}
                      selected={sources}
                      onChange={(vals) => setSources(vals as LeadSource[])}
                      placeholder="Tất cả nguồn"
                      className="w-full bg-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium">Kênh tương tác</Label>
                    <MultiSelect
                      options={CHANNEL_DETAIL_OPTIONS}
                      selected={channelDetails}
                      onChange={(vals) =>
                        setChannelDetails(vals as ChannelDetail[])
                      }
                      placeholder="Tin nhắn, Form, Comment…"
                      className="w-full bg-white"
                    />
                  </div>
                </div>

                {categories.includes("FAIL") && (
                  <div className="space-y-1.5 rounded-md border border-amber-200 bg-amber-50/50 p-3">
                    <Label className="text-xs font-medium text-amber-900">
                      Lý do Fail (Để trống = Tất cả Fail)
                    </Label>
                    <MultiSelect
                      options={FAIL_REASON_OPTIONS}
                      selected={failReasons}
                      onChange={(vals) => setFailReasons(vals as FailReason[])}
                      placeholder="Chọn lý do Fail..."
                      className="w-full bg-white"
                    />
                  </div>
                )}
              </div>
            </div>

            {/* KHỐI 2: TÊN TỆP & TKQC ĐÍCH */}
            <div className="rounded-lg border border-border bg-slate-50/60 p-4">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <CloudUpload className="size-3.5 text-primary" />
                  <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
                    2. Tên tệp & TKQC đích
                  </span>
                </div>
                <Badge variant="outline" className="bg-white text-[10px]">
                  Prefix CRM-
                </Badge>
              </div>

              <div className="grid gap-3.5 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">
                      Tên tệp KH (<code className="font-bold text-primary">CRM-</code>)
                    </Label>
                    <button
                      type="button"
                      onClick={() => setSegmentName(generateSuggestedName())}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                    >
                      <Sparkles className="size-3" />
                      Gợi ý tên
                    </button>
                  </div>
                  <Input
                    value={segmentName}
                    onChange={(e) => setSegmentName(e.target.value)}
                    placeholder="CRM- Peugeot Hà Nam - KHQT"
                    className="h-9 bg-white text-xs font-medium"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label className="text-xs font-medium">TKQC đích</Label>
                    <button
                      type="button"
                      onClick={() => void loadAdAccounts()}
                      disabled={!tokenConfigured || loadingAccounts}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline disabled:opacity-50"
                    >
                      <RefreshCw
                        className={cn(
                          "size-3",
                          loadingAccounts && "animate-spin",
                        )}
                      />
                      Làm mới
                    </button>
                  </div>
                  <Select
                    value={selectedAdAccountId}
                    onValueChange={setSelectedAdAccountId}
                  >
                    <SelectTrigger className="h-9 bg-white text-xs">
                      <SelectValue placeholder="Chọn TKQC (act_...)" />
                    </SelectTrigger>
                    <SelectContent>
                      {adAccounts.map((acc) => (
                        <SelectItem
                          key={acc.id}
                          value={acc.id}
                          className="text-xs"
                        >
                          {acc.name} ({acc.id})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="mt-3 space-y-1.5">
                <Label className="text-xs font-medium">Ghi chú</Label>
                <Input
                  value={segmentDesc}
                  onChange={(e) => setSegmentDesc(e.target.value)}
                  placeholder="Ghi chú thêm (không bắt buộc)..."
                  className="h-9 bg-white text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="shrink-0 border-t border-border bg-slate-50/80 px-6 py-3.5 sm:justify-between">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-slate-700">
              <input
                type="checkbox"
                checked={syncImmediately}
                disabled={!tokenConfigured}
                onChange={(e) => setSyncImmediately(e.target.checked)}
                className="size-4 rounded border-slate-300 text-primary focus:ring-primary"
              />
              <span>
                Đồng bộ lên TKQC{" "}
                <strong>({selectedAdAccountId || "Meta"})</strong> ngay khi lưu
              </span>
            </label>

            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="outline"
                disabled={creating}
                onClick={() => setCreateOpen(false)}
              >
                Huỷ
              </Button>
              <Button
                type="button"
                onClick={() => void handleCreateAndSync()}
                disabled={creating}
                className="gap-1.5 shadow-xs"
              >
                {creating ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : syncImmediately && tokenConfigured ? (
                  <CloudUpload className="size-4" />
                ) : (
                  <Plus className="size-4" />
                )}
                {creating
                  ? "Đang lưu..."
                  : syncImmediately && tokenConfigured
                    ? "Lưu & Đồng bộ"
                    : "Lưu tệp KH"}
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
