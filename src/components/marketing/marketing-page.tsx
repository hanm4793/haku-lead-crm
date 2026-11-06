"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  ArrowDown,
  ArrowUp,
  Clock,
  Megaphone,
  MousePointerClick,
  RefreshCw,
  Search,
  Users,
  Wallet,
  X,
} from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { syncFacebookInsightsAction } from "@/app/settings/facebook-actions";
import { listAdAccountsForAudienceAction } from "@/app/marketing/audience-actions";
import { DateRangePicker, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { Pagination } from "@/components/common/pagination";
import {
  AudienceBuilderPanel,
  type AudiencePageOption,
  type AudienceProjectOption,
} from "@/components/marketing/audience-builder-panel";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type {
  AudienceCampaignOption,
  AudienceSegmentView,
} from "@/lib/db/audiences-repo";
import type { AdInsightRow, CrmAttributionRow, InsightRow } from "@/lib/db/insights-repo";
import { adsManagerUrl } from "@/lib/facebook/ads-manager-url";
import {
  attachEfficiency,
  buildCampaignBrands,
  dashboardTotals,
  EFFICIENCY_LABEL,
  efficiencyRank,
  filterAdRows,
  filterInsightRows,
  pageLabelFromCampaigns,
  seriesByDate,
  storedSpan,
  summarizeAds,
  summarizeCampaigns,
  summarizeCampaignsFromAds,
  summarizeCrmAttribution,
  summarizePages,
  type CampaignBrandId,
  type CampaignSummary,
  type Efficiency,
} from "@/lib/marketing/insights-view";
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent, formatShortTime } from "@/lib/utils";
import { useToast } from "@/components/providers/toast-provider";

const AXIS_STYLE = { fontSize: 11, fill: "#94a3b8" } as const;
const GRID_COLOR = "#e2e8f0";
const TABLE_PAGE_SIZE = 10;

type SortKey = "name" | "spend" | "impressions" | "clicks" | "ctr" | "leads" | "cpl" | "efficiency";

type RatedSummary = CampaignSummary & { efficiency: Efficiency };

export type MarketingPageOption = { id: string; name: string | null };

function shortDate(isoDate: string) {
  const [, month, day] = isoDate.split("-");
  return `${day}/${month}`;
}

function compactMoney(value: number) {
  if (Math.abs(value) >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}tr`;
  if (Math.abs(value) >= 1_000) return `${Math.round(value / 1_000)}k`;
  return formatNumber(value);
}

function compareCampaigns(left: RatedSummary, right: RatedSummary, key: SortKey, direction: "asc" | "desc") {
  if (key === "name") {
    const result = (left.objectName ?? left.objectId).localeCompare(right.objectName ?? right.objectId, "vi");
    return direction === "asc" ? result : -result;
  }
  if (key === "efficiency") {
    const result = efficiencyRank(left.efficiency) - efficiencyRank(right.efficiency);
    return direction === "asc" ? result : -result;
  }
  const leftValue = left[key];
  const rightValue = right[key];
  if (leftValue === null && rightValue === null) return 0;
  if (leftValue === null) return 1;
  if (rightValue === null) return -1;
  return direction === "asc" ? leftValue - rightValue : rightValue - leftValue;
}

export function MarketingPage({
  rows,
  adRows,
  crmRows = [],
  brandOptions = [],
  pages,
  activeProjectId = null,
  projects = [],
  allPages = [],
  savedAudiences = [],
  audienceCampaigns = [],
  canManageAudiences = false,
  tokenConfigured = false,
  hasSynced,
  configured,
  adAccountId,
  syncedAt,
  canSync = false,
}: {
  rows: InsightRow[];
  adRows: AdInsightRow[];
  crmRows?: CrmAttributionRow[];
  brandOptions?: Array<{ code: string; name: string }>;
  pages: MarketingPageOption[];
  activeProjectId?: string | null;
  projects?: AudienceProjectOption[];
  allPages?: AudiencePageOption[];
  savedAudiences?: AudienceSegmentView[];
  audienceCampaigns?: AudienceCampaignOption[];
  canManageAudiences?: boolean;
  tokenConfigured?: boolean;
  hasSynced: boolean;
  configured: boolean;
  adAccountId: string | null;
  syncedAt: string | null;
  today?: string;
  /** Chỉ super admin được chạy đồng bộ Insights. */
  canSync?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const urlTab = searchParams?.get("tab");
  const [activeTab, setActiveTab] = React.useState<"campaigns" | "audiences">(
    urlTab === "audiences" ? "audiences" : "campaigns",
  );
  const [pending, setPending] = React.useState(false);
  const [isRefreshing, startRefreshTransition] = React.useTransition();
  const [preset, setPreset] = React.useState<PresetId>("ALL");
  const [range, setRange] = React.useState<DateRange>({ from: null, to: null });
  const [selectedProjectIds, setSelectedProjectIds] = React.useState<string[]>([]);
  const [selectedAdAccountIds, setSelectedAdAccountIds] = React.useState<string[]>([]);
  const [metaAdAccounts, setMetaAdAccounts] = React.useState<Array<{ id: string; name: string }>>([]);
  const [campaignIds, setCampaignIds] = React.useState<string[]>([]);
  const [pageIds, setPageIds] = React.useState<string[]>([]);
  const [brands, setBrands] = React.useState<CampaignBrandId[]>([]);
  const urlSearch = searchParams?.get("search") ?? null;
  const [query, setQuery] = React.useState(() => urlSearch ?? "");
  const [lastUrlSearch, setLastUrlSearch] = React.useState<string | null>(urlSearch);
  if (urlSearch !== lastUrlSearch) {
    setLastUrlSearch(urlSearch);
    if (urlSearch !== null) {
      setQuery(urlSearch);
    }
  }
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "spend",
    direction: "desc",
  });

  React.useEffect(() => {
    if (!tokenConfigured) return;
    let cancelled = false;
    void listAdAccountsForAudienceAction()
      .then((res) => {
        if (!cancelled && res.ok && res.accounts.length > 0) {
          setMetaAdAccounts(res.accounts.map((a) => ({ id: a.id, name: `${a.name} (${a.accountId})` })));
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tokenConfigured]);

  const adAccountOptions = React.useMemo(() => {
    const map = new Map<string, string>();
    for (const acc of metaAdAccounts) map.set(acc.id, acc.name);
    if (adAccountId && !map.has(adAccountId)) map.set(adAccountId, `TKQC (${adAccountId})`);
    for (const row of rows) {
      if (row.adAccountId && !map.has(row.adAccountId)) map.set(row.adAccountId, `TKQC (${row.adAccountId})`);
    }
    for (const row of adRows) {
      if (row.adAccountId && !map.has(row.adAccountId)) map.set(row.adAccountId, `TKQC (${row.adAccountId})`);
    }
    return [...map.entries()].map(([value, label]) => ({ value, label }));
  }, [metaAdAccounts, adAccountId, rows, adRows]);

  const projectOptions = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const projectAllowedPageIds = React.useMemo(() => {
    if (selectedProjectIds.length === 0) return null;
    return new Set(
      allPages
        .filter((p) => p.projectId && selectedProjectIds.includes(p.projectId))
        .map((p) => p.id),
    );
  }, [allPages, selectedProjectIds]);

  const activePageIdSet = React.useMemo(() => {
    if (pageIds.length > 0) return new Set(pageIds);
    return projectAllowedPageIds;
  }, [pageIds, projectAllowedPageIds]);

  const campaignBrands = React.useMemo(
    () => buildCampaignBrands(brandOptions, rows.map((row) => row.objectName)),
    [brandOptions, rows],
  );

  const span = React.useMemo(() => storedSpan(rows), [rows]);
  const pageCampaignIds = React.useMemo(() => {
    if (!activePageIdSet) return null;
    const ids = new Set<string>();
    for (const row of adRows) {
      if (!activePageIdSet.has(row.pageId ?? "") || !row.campaignId) continue;
      ids.add(row.campaignId);
    }
    return ids;
  }, [adRows, activePageIdSet]);
  const campaignOptions = React.useMemo(() => {
    const entries = new Map<string, string>();
    for (const row of rows) {
      if (selectedAdAccountIds.length > 0 && !selectedAdAccountIds.includes(row.adAccountId ?? "")) continue;
      if (pageCampaignIds && !pageCampaignIds.has(row.objectId)) continue;
      entries.set(row.objectId, row.objectName ?? row.objectId);
    }
    if (pageCampaignIds) {
      for (const row of adRows) {
        if (!row.campaignId || !pageCampaignIds.has(row.campaignId) || entries.has(row.campaignId)) continue;
        entries.set(row.campaignId, row.campaignName ?? row.campaignId);
      }
    }
    return [...entries.entries()]
      .map(([value, label]) => ({ value, label }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  }, [rows, adRows, pageCampaignIds, selectedAdAccountIds]);
  const pageOptions = React.useMemo(() => {
    const official = new Map(pages.map((page) => [page.id, page.name?.trim() || null]));
    const namesByPage = new Map<string, Array<string | null>>();
    for (const row of adRows) {
      if (selectedAdAccountIds.length > 0 && !selectedAdAccountIds.includes(row.adAccountId ?? "")) continue;
      const pageId = row.pageId ?? "";
      if (projectAllowedPageIds && !projectAllowedPageIds.has(pageId)) continue;
      const names = namesByPage.get(pageId) ?? [];
      names.push(row.campaignName);
      namesByPage.set(pageId, names);
    }
    for (const pageId of official.keys()) {
      if (projectAllowedPageIds && !projectAllowedPageIds.has(pageId)) continue;
      if (!namesByPage.has(pageId)) namesByPage.set(pageId, []);
    }
    return [...namesByPage.entries()]
      .map(([value, names]) => ({
        value,
        label: official.get(value) || pageLabelFromCampaigns(names) || (value ? value : "Chưa gắn fanpage"),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  }, [pages, adRows, projectAllowedPageIds, selectedAdAccountIds]);

  const adScope = React.useMemo(
    () =>
      filterAdRows(
        adRows,
        {
          from: range.from,
          to: range.to,
          adAccountIds: selectedAdAccountIds,
          campaignIds,
          brands,
          query,
          pageIds: [],
        },
        campaignBrands,
      ),
    [adRows, range.from, range.to, selectedAdAccountIds, campaignIds, brands, query, campaignBrands],
  );
  const projectScopedAdScope = React.useMemo(
    () =>
      projectAllowedPageIds
        ? adScope.filter((row) => projectAllowedPageIds.has(row.pageId ?? ""))
        : adScope,
    [adScope, projectAllowedPageIds],
  );
  const visibleAds = activePageIdSet
    ? adScope.filter((row) => activePageIdSet.has(row.pageId ?? ""))
    : adScope;
  const filteredCampaigns = React.useMemo(
    () =>
      filterInsightRows(
        rows,
        {
          from: range.from,
          to: range.to,
          adAccountIds: selectedAdAccountIds,
          campaignIds,
          brands,
          query,
        },
        campaignBrands,
      ),
    [rows, range.from, range.to, selectedAdAccountIds, campaignIds, brands, query, campaignBrands],
  );
  const hasExplicitPageFilter = pageIds.length > 0;
  const campaignSummaries = (
    hasExplicitPageFilter
      ? summarizeCampaignsFromAds(visibleAds, campaignBrands)
      : summarizeCampaigns(filteredCampaigns, campaignBrands)
  ).filter((campaign) => !pageCampaignIds || pageCampaignIds.has(campaign.objectId));
  if (pageCampaignIds && campaignIds.some((id) => !pageCampaignIds.has(id))) {
    setCampaignIds(campaignIds.filter((id) => pageCampaignIds.has(id)));
  }
  const ratedCampaigns = attachEfficiency(campaignSummaries);
  const selectionVisible = selectedId !== null && campaignSummaries.some((campaign) => campaign.objectId === selectedId);
  if (selectedId && !selectionVisible) setSelectedId(null);
  const activeId = selectionVisible ? selectedId : null;
  const chartRows = hasExplicitPageFilter
    ? visibleAds.filter((row) => (activeId ? row.campaignId === activeId : true))
    : filteredCampaigns
        .filter((row) => !pageCampaignIds || pageCampaignIds.has(row.objectId))
        .filter((row) => (activeId ? row.objectId === activeId : true));
  const totals = dashboardTotals(chartRows);
  const crmScopedRows = React.useMemo(
    () =>
      projectAllowedPageIds
        ? crmRows.filter((row) => projectAllowedPageIds.has(row.pageId ?? ""))
        : crmRows,
    [crmRows, projectAllowedPageIds],
  );
  const crmTotals = summarizeCrmAttribution(crmScopedRows, { from: range.from, to: range.to, pageIds }, totals.spend);
  const series = seriesByDate(chartRows);
  const campaigns = ratedCampaigns.items.sort((left, right) => compareCampaigns(left, right, sort.key, sort.direction));
  const maxSpend = Math.max(...campaigns.map((campaign) => campaign.spend), 1);
  const selected = campaigns.find((campaign) => campaign.objectId === activeId) ?? null;
  const ratedPages = attachEfficiency(summarizePages(projectScopedAdScope, crmScopedRows, range));
  const adsInCampaign = selected
    ? attachEfficiency(summarizeAds(visibleAds.filter((row) => row.campaignId === selected.objectId), campaignBrands))
    : null;
  const dailyRows = selected
    ? seriesByDate(chartRows).slice().sort((left, right) => right.date.localeCompare(left.date))
    : [];
  const [fanpagePage, setFanpagePage] = React.useState(1);
  const [fanpagePageSize, setFanpagePageSize] = React.useState(TABLE_PAGE_SIZE);
  const [campaignPage, setCampaignPage] = React.useState(1);
  const [campaignPageSize, setCampaignPageSize] = React.useState(TABLE_PAGE_SIZE);
  const [dailyPage, setDailyPage] = React.useState(1);
  const [dailyPageSize, setDailyPageSize] = React.useState(TABLE_PAGE_SIZE);

  const sortedPages = React.useMemo(
    () => ratedPages.items.slice().sort((left, right) => right.spend - left.spend),
    [ratedPages.items],
  );
  const fanpagePageCount = Math.max(1, Math.ceil(sortedPages.length / fanpagePageSize));
  const safeFanpagePage = Math.min(Math.max(1, fanpagePage), fanpagePageCount);
  const pagedFanpages = sortedPages.slice(
    (safeFanpagePage - 1) * fanpagePageSize,
    safeFanpagePage * fanpagePageSize,
  );

  const campaignPageCount = Math.max(1, Math.ceil(campaigns.length / campaignPageSize));
  const safeCampaignPage = Math.min(Math.max(1, campaignPage), campaignPageCount);
  const pagedCampaigns = campaigns.slice(
    (safeCampaignPage - 1) * campaignPageSize,
    safeCampaignPage * campaignPageSize,
  );

  const dailyPageCount = Math.max(1, Math.ceil(dailyRows.length / dailyPageSize));
  const safeDailyPage = Math.min(Math.max(1, dailyPage), dailyPageCount);
  const pagedDailyRows = dailyRows.slice(
    (safeDailyPage - 1) * dailyPageSize,
    safeDailyPage * dailyPageSize,
  );

  const filtersActive =
    preset !== "ALL" ||
    selectedProjectIds.length > 0 ||
    selectedAdAccountIds.length > 0 ||
    campaignIds.length > 0 ||
    pageIds.length > 0 ||
    brands.length > 0 ||
    query.trim().length > 0 ||
    selectedId !== null;

  function handleProjectChange(nextProjectIds: string[]) {
    setSelectedProjectIds(nextProjectIds);
    setFanpagePage(1);
    setCampaignPage(1);
    if (nextProjectIds.length > 0) {
      const allowed = new Set(
        allPages
          .filter((p) => p.projectId && nextProjectIds.includes(p.projectId))
          .map((p) => p.id),
      );
      setPageIds((prev) => prev.filter((id) => allowed.has(id)));
    }
  }

  function applyRange(nextPreset: PresetId, nextRange: DateRange) {
    setPreset(nextPreset);
    setRange(nextRange);
    setFanpagePage(1);
    setCampaignPage(1);
    setDailyPage(1);
  }

  function toggleBrand(brand: CampaignBrandId) {
    setBrands((current) => (current.includes(brand) ? current.filter((item) => item !== brand) : [...current, brand]));
    setFanpagePage(1);
    setCampaignPage(1);
  }

  function toggleSort(key: SortKey) {
    setCampaignPage(1);
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );
  }

  function clearFilters() {
    setPreset("ALL");
    setRange({ from: null, to: null });
    setSelectedProjectIds([]);
    setSelectedAdAccountIds([]);
    setCampaignIds([]);
    setPageIds([]);
    setBrands([]);
    setQuery("");
    setSelectedId(null);
    setFanpagePage(1);
    setCampaignPage(1);
    setDailyPage(1);
  }

  const [autoSyncMinutes, setAutoSyncMinutes] = React.useState<string>(() => {
    if (typeof window === "undefined") return "30";
    return window.localStorage.getItem("semtop_auto_sync_minutes") ?? "30";
  });

  const handleAutoSyncChange = (value: string) => {
    setAutoSyncMinutes(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("semtop_auto_sync_minutes", value);
    }
    toast.info(
      value === "0"
        ? "Đã tắt tự động đồng bộ"
        : `Đã bật tự động đồng bộ: ${value === "60" ? "1h" : `${value}p`}`,
    );
  };

  const runBackgroundAutoSync = React.useCallback(
    async (intervalMinutes: number) => {
      if (!canSync || !configured || pending) return;
      try {
        const insightsRes = await fetch(`/api/cron/facebook-sync?kind=insights&minInterval=${intervalMinutes}`, {
          method: "POST",
        });
        if (insightsRes.ok) {
          const insightsPayload = (await insightsRes.json()) as { ok?: boolean; didSyncAny?: boolean };
          if (insightsPayload.ok && insightsPayload.didSyncAny) {
            router.refresh();
          }
        }
        const res = await fetch(`/api/cron/facebook-sync?kind=leads&minInterval=${intervalMinutes}`, {
          method: "POST",
        });
        if (!res.ok) return;
        const payload = (await res.json()) as { ok?: boolean; didSyncAny?: boolean };
        if (payload.ok && payload.didSyncAny) {
          router.refresh();
        }
      } catch {
        // Bỏ qua lỗi mạng ngầm để không làm phiền người dùng
      }
    },
    [canSync, configured, pending, router],
  );

  React.useEffect(() => {
    const minutes = Number(autoSyncMinutes) || 0;
    if (!canSync || !configured || minutes <= 0) return;

    const lastMs = syncedAt ? new Date(syncedAt).getTime() : 0;
    if (!lastMs || Date.now() - lastMs >= minutes * 60_000) {
      void runBackgroundAutoSync(minutes);
    }

    const timer = window.setInterval(() => {
      void runBackgroundAutoSync(minutes);
    }, minutes * 60_000);

    return () => window.clearInterval(timer);
  }, [autoSyncMinutes, canSync, configured, syncedAt, runBackgroundAutoSync]);

  async function sync() {
    setPending(true);
    try {
      const outcome = await syncFacebookInsightsAction();
      if (!outcome.ok) {
        toast.error("Đồng bộ Insights thất bại", outcome.error);
        return;
      }
      if (outcome.result.errors > 0) toast.warning("Đồng bộ Insights xong nhưng có lỗi", outcome.result.message);
      else toast.success("Đã đồng bộ Insights", outcome.result.message);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className={cn("relative space-y-3.5 p-3 sm:space-y-4 sm:p-4", pending && "pointer-events-none select-none")}>
      {pending && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-40 flex cursor-wait items-center justify-center bg-slate-900/15 backdrop-blur-[1.5px]"
        >
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-5 py-3.5 shadow-lg ring-1 ring-black/5">
            <RefreshCw className="size-5 shrink-0 animate-spin text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">
                Đang đồng bộ dữ liệu Marketing từ Meta...
              </span>
              <span className="text-[11px] text-muted-foreground">Vui lòng đợi trong giây lát</span>
            </div>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-start justify-between gap-2.5 sm:gap-3">
        <div className="max-md:hidden">
          <h1 className="text-xl font-bold">Marketing &amp; Tệp KH</h1>
          <p className="text-[13px] text-muted-foreground">
            Hiệu quả chiến dịch QC &amp; quản lý tệp KH
            {span.from && span.to ? ` · ${formatDate(span.from)} – ${formatDate(span.to)}` : ""}
          </p>
        </div>
        <div className="flex w-full flex-nowrap items-center gap-1.5 md:w-auto md:flex-wrap md:gap-2">
          {syncedAt && (
            <button
              type="button"
              onClick={() => startRefreshTransition(() => router.refresh())}
              title={`Cập nhật lúc ${formatDateTime(syncedAt)} — Nhấn để làm mới`}
              className="inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2 text-[11.5px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15 max-md:h-9 max-md:rounded-lg sm:px-2.5 sm:text-[11px]"
            >
              <span className="size-1.5 shrink-0 rounded-full bg-emerald-500" />
              <span className="max-sm:hidden">Cập nhật:</span>
              <span className="tabular-nums sm:hidden">{formatShortTime(syncedAt)}</span>
              <span className="hidden tabular-nums sm:inline">{formatDateTime(syncedAt)}</span>
              <RefreshCw className={cn("size-3.5 opacity-75 sm:size-3", (pending || isRefreshing) && "animate-spin")} />
            </button>
          )}
          {canSync && activeTab === "campaigns" ? (
            <div className="flex min-w-0 flex-1 items-center justify-end gap-1.5 sm:flex-none sm:gap-2">
              <Select value={autoSyncMinutes} onValueChange={handleAutoSyncChange}>
                <SelectTrigger size="sm" className="min-w-0 flex-1 gap-1.5 px-2.5 text-xs sm:w-[138px] sm:flex-none">
                  <Clock className="size-3.5 shrink-0 text-primary" />
                  <SelectValue placeholder="Tự động" />
                </SelectTrigger>
                <SelectContent align="end">
                  <SelectItem value="0" className="text-xs">
                    Tự động: Tắt
                  </SelectItem>
                  <SelectItem value="15" className="text-xs">
                    Tự động: 15p
                  </SelectItem>
                  <SelectItem value="30" className="text-xs">
                    Tự động: 30p
                  </SelectItem>
                  <SelectItem value="60" className="text-xs">
                    Tự động: 1h
                  </SelectItem>
                </SelectContent>
              </Select>

              <Button
                type="button"
                size="sm"
                className="h-8 shrink-0 gap-1.5 px-2.5 text-xs max-md:h-9 max-md:rounded-lg sm:px-3"
                disabled={pending || !configured}
                onClick={() => void sync()}
              >
                <RefreshCw className={cn("size-3.5", pending && "animate-spin")} />
                <span className="max-sm:hidden">{pending ? "Đang đồng bộ…" : "Đồng bộ ngay"}</span>
                <span className="sm:hidden">{pending ? "Đang tải…" : "Đồng bộ"}</span>
              </Button>
            </div>
          ) : null}
        </div>
      </div>

      {canManageAudiences && (
        <Tabs
          value={activeTab}
          onValueChange={(val) => setActiveTab(val as "campaigns" | "audiences")}
        >
          <TabsList className="grid w-full grid-cols-2 border-b border-border sm:inline-flex sm:w-auto sm:justify-start">
            <TabsTrigger value="campaigns" className="gap-1.5">
              <Megaphone className="size-3.5" />
              <span className="truncate">Chiến dịch &amp; QC</span>
            </TabsTrigger>
            <TabsTrigger value="audiences" className="gap-1.5">
              <Users className="size-3.5" />
              <span>Tệp KH</span>
              <Badge
                variant={activeTab === "audiences" ? "secondary" : "muted"}
                className="ml-0.5 px-1.5 py-0 text-[10px] tabular-nums"
              >
                {savedAudiences.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </Tabs>
      )}

      {activeTab === "audiences" && canManageAudiences ? (
        <AudienceBuilderPanel
          activeProjectId={activeProjectId}
          projects={projects}
          allPages={allPages}
          campaignOptions={audienceCampaigns}
          initialSegments={savedAudiences}
          defaultAdAccountId={adAccountId}
          tokenConfigured={tokenConfigured}
        />
      ) : (
        <>
          {canSync && !configured ? (
            <p className="text-sm text-amber-800" role="alert">
              Thiếu FACEBOOK_AD_ACCOUNT_ID — cấu hình biến môi trường để đồng bộ Insights.
            </p>
          ) : null}

          <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-center">
            <div className="col-span-2 sm:col-span-1">
              <DateRangePicker preset={preset} range={range} onChange={applyRange} />
            </div>
            {projects.length > 0 && (
              <MultiSelect
                options={projectOptions}
                selected={selectedProjectIds}
                onChange={handleProjectChange}
                placeholder="Tất cả dự án"
                className="h-8 w-full text-[13px] max-md:h-9 sm:w-[180px]"
                contentClassName="w-[240px]"
              />
            )}
            <MultiSelect
              options={adAccountOptions}
              selected={selectedAdAccountIds}
              onChange={(next) => {
                setSelectedAdAccountIds(next);
                setFanpagePage(1);
                setCampaignPage(1);
              }}
              placeholder="Tất cả TKQC"
              className="h-8 w-full text-[13px] max-md:h-9 sm:w-[200px]"
              contentClassName="w-[280px]"
            />
            <MultiSelect
              options={pageOptions}
              selected={pageIds}
              onChange={(next) => {
                setPageIds(next);
                setCampaignPage(1);
              }}
              placeholder="Tất cả fanpage"
              className="h-8 w-full text-[13px] max-md:h-9 sm:w-[200px]"
              contentClassName="w-[280px]"
            />
            <MultiSelect
              options={campaignOptions}
              selected={campaignIds}
              onChange={(next) => {
                setCampaignIds(next);
                setCampaignPage(1);
              }}
              placeholder="Tất cả chiến dịch"
              className="h-8 w-full text-[13px] max-md:h-9 sm:w-[240px]"
              contentClassName="w-[340px]"
            />
            <div className="relative col-span-2 sm:col-span-1">
              <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFanpagePage(1);
                  setCampaignPage(1);
                }}
                placeholder="Tìm chiến dịch, QC…"
                className="h-8 w-full pl-8 text-[13px] max-md:h-9 sm:w-[220px]"
                aria-label="Tìm chiến dịch"
              />
            </div>
            {filtersActive ? (
              <Button type="button" variant="ghost" size="sm" onClick={clearFilters} className="col-span-2 sm:col-span-1">
                <X />
                Xóa lọc
              </Button>
            ) : null}
          </div>

          {campaignBrands.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {campaignBrands.map((brand) => {
                const active = brands.includes(brand.id);
                return (
                  <button
                    key={brand.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggleBrand(brand.id)}
                    className={cn(
                      "rounded-full border px-2.5 py-1 text-[12px] font-medium transition-colors",
                      active
                        ? "border-primary bg-primary text-primary-foreground"
                        : "border-border bg-card text-muted-foreground hover:bg-accent hover:text-foreground",
                    )}
                  >
                    {brand.label}
                  </button>
                );
              })}
            </div>
          )}

          <p className="text-[12px] text-muted-foreground">
            CPL trung vị{ratedCampaigns.benchmark != null ? `: ${formatCurrency(ratedCampaigns.benchmark)}` : ""} · ≤ trung vị (tối đa 300.000 ₫): Hiệu quả · ≤ 1.5x (tối đa 600.000 ₫): Trung bình · &gt; ngưỡng: Kém.
          </p>

          {rows.length === 0 ? (
            <div className="rounded-xl border border-dashed p-10 text-center text-sm text-muted-foreground">
              {hasSynced ? "Không có dữ liệu Insights." : "Chưa có dữ liệu Insights — bấm Đồng bộ"}
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:gap-3 xl:grid-cols-6">
                <Kpi label="Chi tiêu" value={totals.spend === null ? "—" : formatCurrency(totals.spend)} icon={Wallet} />
                <Kpi label="Hiển thị" value={totals.impressions === null ? "—" : formatNumber(totals.impressions)} />
                <Kpi label="Lượt click" value={totals.clicks === null ? "—" : formatNumber(totals.clicks)} icon={MousePointerClick} />
                <Kpi label="CTR" value={totals.ctr === null ? "—" : formatPercent(totals.ctr)} />
                <Kpi label="Lead (Meta)" value={totals.leads === null ? "—" : formatNumber(totals.leads)} />
                <Kpi label="CPL (Meta)" value={totals.cpl === null ? "—" : formatCurrency(totals.cpl)} />
              </div>

              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5 md:gap-3">
                <Kpi label="Lead thực (CRM)" value={formatNumber(crmTotals.crmLeads)} />
                <Kpi label="KHQT" value={formatNumber(crmTotals.khqt)} />
                <Kpi label="KHD (Chốt)" value={formatNumber(crmTotals.khd)} />
                <Kpi label="CPQL (Chi / KHQT)" value={crmTotals.cpql === null ? "—" : formatCurrency(crmTotals.cpql)} />
                <Kpi
                  label="CPS (Chi / KHD)"
                  value={crmTotals.cps === null ? "—" : formatCurrency(crmTotals.cps)}
                  className="col-span-2 sm:col-span-1"
                />
              </div>

              <section className="rounded-xl border border-border bg-card p-3.5 shadow-xs sm:p-4">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-sm font-semibold">
                    {selected ? selected.objectName ?? selected.objectId : "Chi tiêu & Lead theo ngày"}
                  </h2>
                  <p className="text-[12px] text-muted-foreground">Bấm cột ngày để lọc</p>
                </div>
                {series.length === 0 ? (
                  <p className="py-16 text-center text-sm text-muted-foreground">Không có ngày nào khớp bộ lọc.</p>
                ) : (
                  <ResponsiveContainer width="100%" height={260}>
                    <ComposedChart
                      data={series}
                      margin={{ top: 8, right: 4, bottom: 0, left: -4 }}
                      style={{ cursor: "pointer" }}
                      onClick={(state) => {
                        const date = state?.activeLabel;
                        if (typeof date === "string") applyRange("CUSTOM", { from: date, to: date });
                      }}
                    >
                      <CartesianGrid stroke={GRID_COLOR} vertical={false} />
                      <XAxis
                        dataKey="date"
                        tick={AXIS_STYLE}
                        tickLine={false}
                        axisLine={{ stroke: GRID_COLOR }}
                        minTickGap={24}
                        tickFormatter={(value) => shortDate(String(value))}
                      />
                      <YAxis
                        yAxisId="spend"
                        tick={AXIS_STYLE}
                        tickLine={false}
                        axisLine={false}
                        width={46}
                        tickFormatter={compactMoney}
                      />
                      <YAxis
                        yAxisId="leads"
                        orientation="right"
                        tick={AXIS_STYLE}
                        tickLine={false}
                        axisLine={false}
                        width={28}
                        allowDecimals={false}
                      />
                      <Tooltip
                        contentStyle={{
                          borderRadius: 8,
                          border: `1px solid ${GRID_COLOR}`,
                          fontSize: 12,
                          boxShadow: "0 8px 24px rgba(15,28,51,.10)",
                        }}
                        labelFormatter={(label) => formatDate(String(label))}
                        formatter={(value, name) =>
                          name === "spend"
                            ? [formatCurrency(Number(value)), "Chi tiêu"]
                            : [formatNumber(Number(value)), "Lead"]
                        }
                      />
                      <Legend formatter={(value) => (value === "spend" ? "Chi tiêu" : "Lead")} />
                      <Bar yAxisId="leads" dataKey="leads" fill="#0f9d8f" radius={[3, 3, 0, 0]} maxBarSize={28} />
                      <Line yAxisId="spend" type="monotone" dataKey="spend" stroke="#12479e" strokeWidth={2} dot={false} />
                    </ComposedChart>
                  </ResponsiveContainer>
                )}
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                  <h2 className="text-sm font-semibold">Theo Fanpage</h2>
                  <p className="text-[12px] text-muted-foreground tabular-nums">
                    {sortedPages.length} fanpage · bấm chọn để lọc
                  </p>
                </div>
                {adRows.length === 0 ? (
                  <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                    Chưa có dữ liệu QC — bấm Đồng bộ Insights.
                  </p>
                ) : (
                  <>
                    {/* MOBILE CARD LIST (< 768px) */}
                    <div className="divide-y divide-border/70 md:hidden">
                      {pagedFanpages.map((page) => {
                        const active = pageIds.length === 1 && pageIds[0] === page.pageId;
                        const label =
                          pageOptions.find((option) => option.value === page.pageId)?.label ?? "Chưa gắn fanpage";
                        return (
                          <div
                            key={page.pageId || "unknown"}
                            role="button"
                            tabIndex={0}
                            onClick={() => {
                              setPageIds(active ? [] : [page.pageId]);
                              setCampaignPage(1);
                            }}
                            className={cn(
                              "space-y-2.5 p-3.5 transition-colors active:bg-slate-50",
                              active && "bg-primary/6 ring-1 ring-inset ring-primary/30",
                            )}
                          >
                            <div className="flex items-start justify-between gap-2">
                              <span className="min-w-0 flex-1 break-words text-[14px] font-bold leading-snug text-slate-900">
                                {label}
                              </span>
                              <EfficiencyBadge value={page.efficiency} />
                            </div>

                            <div className="grid grid-cols-3 gap-2 rounded-lg bg-slate-50/85 p-2.5 text-xs">
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">Chi tiêu</div>
                                <div className="mt-0.5 truncate font-bold tabular-nums text-slate-900">
                                  {formatCurrency(page.spend)}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">Lead Meta</div>
                                <div className="mt-0.5 font-semibold tabular-nums text-slate-800">
                                  {formatNumber(page.leads)}{" "}
                                  <span className="text-[10px] font-normal text-slate-500">
                                    ({page.ctr === null ? "—" : formatPercent(page.ctr)})
                                  </span>
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">CPL Meta</div>
                                <div className="mt-0.5 truncate font-semibold tabular-nums text-slate-800">
                                  {page.cpl === null ? "—" : formatCurrency(page.cpl)}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">Lead CRM</div>
                                <div className="mt-0.5 font-semibold tabular-nums text-primary">
                                  {formatNumber(page.crmLeads)}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">KHQT / CPQL</div>
                                <div className="mt-0.5 truncate font-semibold tabular-nums text-emerald-700">
                                  {formatNumber(page.khqt)} · {page.cpql === null ? "—" : compactMoney(page.cpql)}
                                </div>
                              </div>
                              <div className="min-w-0">
                                <div className="text-[10px] text-muted-foreground">KHĐ / CPS</div>
                                <div className="mt-0.5 truncate font-semibold tabular-nums text-slate-800">
                                  {formatNumber(page.khd)} · {page.cps === null ? "—" : compactMoney(page.cps)}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP & TABLET TABLE (>= 768px) */}
                    <div className="thin-scrollbar hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[860px] text-left text-[13px]">
                        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <th className="sticky left-0 z-10 bg-slate-50 px-3 py-2.5 font-medium shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)]">
                              Fanpage
                            </th>
                            <th className="px-3 py-2.5 text-right font-medium">Chi tiêu</th>
                            <th className="px-3 py-2.5 text-right font-medium">Lead (Meta)</th>
                            <th className="px-3 py-2.5 text-right font-medium">CPL</th>
                            <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                            <th className="px-3 py-2.5 text-right font-medium">Lead CRM</th>
                            <th className="px-3 py-2.5 text-right font-medium">KHQT</th>
                            <th className="px-3 py-2.5 text-right font-medium">KHD</th>
                            <th className="px-3 py-2.5 text-right font-medium">CPQL</th>
                            <th className="px-3 py-2.5 text-right font-medium">CPS</th>
                            <th className="px-3 py-2.5 text-right font-medium">Hiệu quả</th>
                          </tr>
                        </thead>
                        <tbody>
                          {pagedFanpages.map((page) => {
                            const active = pageIds.length === 1 && pageIds[0] === page.pageId;
                            const label =
                              pageOptions.find((option) => option.value === page.pageId)?.label ?? "Chưa gắn fanpage";
                            return (
                              <tr
                                key={page.pageId || "unknown"}
                                className={cn(
                                  "group cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                                  active && "bg-accent",
                                )}
                                onClick={() => {
                                  setPageIds(active ? [] : [page.pageId]);
                                  setCampaignPage(1);
                                }}
                              >
                                <td
                                  className={cn(
                                    "sticky left-0 z-10 max-w-[180px] truncate bg-card px-3 py-2.5 font-medium shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] group-hover:bg-slate-50 sm:max-w-[240px]",
                                    active && "bg-accent",
                                  )}
                                  title={label}
                                >
                                  {label}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(page.spend)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(page.leads)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {page.cpl === null ? "—" : formatCurrency(page.cpl)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {page.ctr === null ? "—" : formatPercent(page.ctr)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(page.crmLeads)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(page.khqt)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(page.khd)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {page.cpql === null ? "—" : formatCurrency(page.cpql)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {page.cps === null ? "—" : formatCurrency(page.cps)}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <EfficiencyBadge value={page.efficiency} />
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={safeFanpagePage}
                      pageSize={fanpagePageSize}
                      total={sortedPages.length}
                      unit="fanpage"
                      onPageChange={setFanpagePage}
                      onPageSizeChange={(size) => {
                        setFanpagePageSize(size);
                        setFanpagePage(1);
                      }}
                    />
                  </>
                )}
              </section>

              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3.5 py-3 sm:px-4">
                  <div>
                    <h2 className="text-sm font-semibold">Theo Chiến dịch</h2>
                    <p className="text-[11.5px] text-muted-foreground tabular-nums">
                      {campaigns.length} chiến dịch · bấm để xem chi tiết Ads
                    </p>
                  </div>
                  <div className="w-40 md:hidden">
                    <Select
                      value={sort.key}
                      onValueChange={(v) => {
                        setCampaignPage(1);
                        setSort({ key: v as SortKey, direction: v === "name" ? "asc" : "desc" });
                      }}
                    >
                      <SelectTrigger size="sm" className="h-8 text-xs">
                        <SelectValue placeholder="Sắp xếp" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="spend">Chi tiêu cao nhất</SelectItem>
                        <SelectItem value="leads">Nhiều Lead nhất</SelectItem>
                        <SelectItem value="cpl">CPL</SelectItem>
                        <SelectItem value="clicks">Lượt Click</SelectItem>
                        <SelectItem value="impressions">Lượt Hiển thị</SelectItem>
                        <SelectItem value="name">Tên A → Z</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                {campaigns.length === 0 ? (
                  <p className="px-4 py-10 text-center text-sm text-muted-foreground">Không có chiến dịch khớp bộ lọc.</p>
                ) : (
                  <>
                    {/* MOBILE CARD LIST (< 768px) — Tích hợp danh sách Ads dạng thẻ con không cần scroll ngang */}
                    <div className="divide-y divide-border/70 md:hidden">
                      {pagedCampaigns.map((campaign) => {
                        const isExpanded = campaign.objectId === activeId;
                        return (
                          <div
                            key={campaign.objectId}
                            className={cn("p-3.5 transition-colors", isExpanded && "bg-slate-50/70")}
                          >
                            <div
                              role="button"
                              tabIndex={0}
                              onClick={() => {
                                setSelectedId(isExpanded ? null : campaign.objectId);
                                setDailyPage(1);
                              }}
                              className="space-y-2.5"
                            >
                              <div className="flex items-start justify-between gap-2">
                                <div className="min-w-0 flex-1 break-words text-[13.5px] font-bold leading-snug text-slate-900">
                                  <AdsManagerTitle
                                    level="campaign"
                                    objectId={campaign.objectId}
                                    adAccountId={campaign.adAccountId ?? adAccountId}
                                  >
                                    {campaign.objectName ?? campaign.objectId}
                                  </AdsManagerTitle>
                                </div>
                                <EfficiencyBadge value={campaign.efficiency} />
                              </div>

                              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                                <div
                                  className="h-full rounded-full bg-primary"
                                  style={{ width: `${Math.max(3, (campaign.spend / maxSpend) * 100)}%` }}
                                />
                              </div>

                              <div className="grid grid-cols-3 gap-2 rounded-lg bg-white p-2.5 text-xs ring-1 ring-border/70">
                                <div className="min-w-0">
                                  <div className="text-[10px] text-muted-foreground">Chi tiêu</div>
                                  <div className="mt-0.5 truncate font-bold tabular-nums text-slate-900">
                                    {formatCurrency(campaign.spend)}
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] text-muted-foreground">Lead / CPL</div>
                                  <div className="mt-0.5 truncate font-semibold tabular-nums text-primary">
                                    {formatNumber(campaign.leads)} · {campaign.cpl === null ? "—" : compactMoney(campaign.cpl)}
                                  </div>
                                </div>
                                <div className="min-w-0">
                                  <div className="text-[10px] text-muted-foreground">Click / CTR</div>
                                  <div className="mt-0.5 truncate font-semibold tabular-nums text-slate-700">
                                    {formatNumber(campaign.clicks)} ({campaign.ctr === null ? "—" : formatPercent(campaign.ctr)})
                                  </div>
                                </div>
                              </div>

                              <div className="flex items-center justify-between text-xs">
                                <span className="text-[11px] tabular-nums text-muted-foreground">
                                  Hiển thị: {formatNumber(campaign.impressions)}
                                </span>
                                <span className="font-semibold text-primary">
                                  {isExpanded ? "Ẩn danh sách Ads ▲" : "Xem danh sách Ads ▼"}
                                </span>
                              </div>
                            </div>

                            {isExpanded && adsInCampaign && (
                              <div className="mt-3 space-y-2 border-t border-border/80 pt-3">
                                <div className="flex flex-wrap items-baseline justify-between gap-1">
                                  <span className="text-xs font-bold text-slate-800">
                                    Ads trong chiến dịch ({adsInCampaign.items.length})
                                  </span>
                                  {adsInCampaign.benchmark != null && (
                                    <span className="text-[11px] text-muted-foreground">
                                      CPL chuẩn: {formatCurrency(adsInCampaign.benchmark)}
                                    </span>
                                  )}
                                </div>

                                {adsInCampaign.items.length === 0 ? (
                                  <p className="text-xs text-muted-foreground">Chưa có dòng ads trong bộ lọc.</p>
                                ) : (
                                  <div className="max-h-[340px] space-y-2 overflow-y-auto overscroll-contain pr-0.5">
                                    {adsInCampaign.items
                                      .slice()
                                      .sort((left, right) => right.spend - left.spend)
                                      .map((ad) => (
                                        <div
                                          key={ad.objectId}
                                          className="space-y-1.5 rounded-lg border border-border/80 bg-white p-2.5 text-xs shadow-2xs"
                                        >
                                          <div className="flex items-start justify-between gap-2">
                                            <div className="min-w-0 flex-1 break-words font-semibold text-slate-800">
                                              <AdsManagerTitle
                                                level="ad"
                                                objectId={ad.objectId}
                                                adAccountId={ad.adAccountId ?? adAccountId}
                                              >
                                                {ad.objectName ?? ad.objectId}
                                              </AdsManagerTitle>
                                              {ad.adsetName && (
                                                <p className="mt-0.5 truncate text-[11px] font-normal text-muted-foreground">
                                                  Nhóm: {ad.adsetName}
                                                </p>
                                              )}
                                            </div>
                                            <EfficiencyBadge value={ad.efficiency} />
                                          </div>
                                          <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-border/50 pt-1.5 text-[11px] tabular-nums text-slate-600">
                                            <span>
                                              Chi: <strong className="text-slate-900">{formatCurrency(ad.spend)}</strong>
                                            </span>
                                            <span>
                                              Lead: <strong className="text-primary">{formatNumber(ad.leads)}</strong>
                                            </span>
                                            <span>
                                              CPL: <strong>{ad.cpl === null ? "—" : compactMoney(ad.cpl)}</strong>
                                            </span>
                                            <span>
                                              CTR: <strong>{ad.ctr === null ? "—" : formatPercent(ad.ctr)}</strong>
                                            </span>
                                          </div>
                                        </div>
                                      ))}
                                  </div>
                                )}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>

                    {/* DESKTOP & TABLET TABLE (>= 768px) */}
                    <div className="thin-scrollbar hidden overflow-x-auto md:block">
                      <table className="w-full min-w-[820px] text-left text-[13px]">
                        <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                          <tr>
                            <SortHeader
                              label="Chiến dịch"
                              sortKey="name"
                              sort={sort}
                              onSort={toggleSort}
                              stickyLeft
                            />
                            <SortHeader label="Chi tiêu" sortKey="spend" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="Hiển thị" sortKey="impressions" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="Click" sortKey="clicks" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="CTR" sortKey="ctr" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="Lead" sortKey="leads" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="CPL" sortKey="cpl" sort={sort} onSort={toggleSort} align="right" />
                            <SortHeader label="Hiệu quả" sortKey="efficiency" sort={sort} onSort={toggleSort} align="right" />
                          </tr>
                        </thead>
                        <tbody>
                          {pagedCampaigns.map((campaign) => (
                            <React.Fragment key={campaign.objectId}>
                              <tr
                                className={cn(
                                  "group cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                                  campaign.objectId === activeId && "bg-accent",
                                )}
                                onClick={() => {
                                  setSelectedId(campaign.objectId === activeId ? null : campaign.objectId);
                                  setDailyPage(1);
                                }}
                              >
                                <td
                                  className={cn(
                                    "sticky left-0 z-10 max-w-[200px] bg-card px-3 py-2.5 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)] group-hover:bg-slate-50 sm:max-w-[300px]",
                                    campaign.objectId === activeId && "bg-accent",
                                  )}
                                >
                                  <div className="truncate">
                                    <AdsManagerTitle
                                      level="campaign"
                                      objectId={campaign.objectId}
                                      adAccountId={campaign.adAccountId ?? adAccountId}
                                    >
                                      {campaign.objectName ?? campaign.objectId}
                                    </AdsManagerTitle>
                                  </div>
                                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                                    <div
                                      className="h-full rounded-full bg-primary"
                                      style={{ width: `${Math.max(2, (campaign.spend / maxSpend) * 100)}%` }}
                                    />
                                  </div>
                                  <span className="mt-1 inline-block text-[11.5px] font-medium text-primary">
                                    {campaign.objectId === activeId ? "Ẩn ads" : "Xem ads"}
                                  </span>
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(campaign.spend)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(campaign.impressions)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(campaign.clicks)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {campaign.ctr === null ? "—" : formatPercent(campaign.ctr)}
                                </td>
                                <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(campaign.leads)}</td>
                                <td className="px-3 py-2.5 text-right tabular-nums">
                                  {campaign.cpl === null ? "—" : formatCurrency(campaign.cpl)}
                                </td>
                                <td className="px-3 py-2.5 text-right">
                                  <EfficiencyBadge value={campaign.efficiency} />
                                </td>
                              </tr>
                              {campaign.objectId === activeId && adsInCampaign ? (
                                <tr className="border-b bg-muted/20">
                                  <td colSpan={8} className="px-4 py-3">
                                    <div className="mb-2 flex items-baseline justify-between gap-3">
                                      <p className="text-[13px] font-semibold">Ads trong chiến dịch này</p>
                                      <p className="text-[12px] text-muted-foreground">
                                        {adsInCampaign.benchmark != null
                                          ? `CPL trung vị của các ads có lead: ${formatCurrency(adsInCampaign.benchmark)}`
                                          : "Chưa đủ ads có lead để so CPL"}
                                      </p>
                                    </div>
                                    {adsInCampaign.items.length === 0 ? (
                                      <p className="text-sm text-muted-foreground">
                                        Chiến dịch này chưa có dòng ads trong bộ lọc.
                                      </p>
                                    ) : (
                                      <div className="thin-scrollbar max-h-[360px] overflow-auto">
                                        <table className="w-full min-w-[740px] text-left text-[13px]">
                                          <thead className="sticky top-0 bg-muted/90 text-xs text-muted-foreground backdrop-blur-xs">
                                            <tr>
                                              <th className="px-2 py-1.5 font-medium">Ads</th>
                                              <th className="px-2 py-1.5 font-medium">Nhóm</th>
                                              <th className="px-2 py-1.5 text-right font-medium">Chi tiêu</th>
                                              <th className="px-2 py-1.5 text-right font-medium">Click</th>
                                              <th className="px-2 py-1.5 text-right font-medium">CTR</th>
                                              <th className="px-2 py-1.5 text-right font-medium">Lead</th>
                                              <th className="px-2 py-1.5 text-right font-medium">CPL</th>
                                              <th className="px-2 py-1.5 text-right font-medium">Hiệu quả</th>
                                            </tr>
                                          </thead>
                                          <tbody>
                                            {adsInCampaign.items
                                              .slice()
                                              .sort((left, right) => right.spend - left.spend)
                                              .map((ad) => (
                                                <tr key={ad.objectId} className="border-t border-border/70">
                                                  <td className="px-2 py-2">
                                                    <AdsManagerTitle
                                                      level="ad"
                                                      objectId={ad.objectId}
                                                      adAccountId={ad.adAccountId ?? adAccountId}
                                                    >
                                                      {ad.objectName ?? ad.objectId}
                                                    </AdsManagerTitle>
                                                  </td>
                                                  <td className="px-2 py-2 text-muted-foreground">{ad.adsetName ?? "—"}</td>
                                                  <td className="px-2 py-2 text-right tabular-nums">{formatCurrency(ad.spend)}</td>
                                                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(ad.clicks)}</td>
                                                  <td className="px-2 py-2 text-right tabular-nums">
                                                    {ad.ctr === null ? "—" : formatPercent(ad.ctr)}
                                                  </td>
                                                  <td className="px-2 py-2 text-right tabular-nums">{formatNumber(ad.leads)}</td>
                                                  <td className="px-2 py-2 text-right tabular-nums">
                                                    {ad.cpl === null ? "—" : formatCurrency(ad.cpl)}
                                                  </td>
                                                  <td className="px-2 py-2 text-right">
                                                    <EfficiencyBadge value={ad.efficiency} />
                                                  </td>
                                                </tr>
                                              ))}
                                          </tbody>
                                        </table>
                                      </div>
                                    )}
                                  </td>
                                </tr>
                              ) : null}
                            </React.Fragment>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <Pagination
                      page={safeCampaignPage}
                      pageSize={campaignPageSize}
                      total={campaigns.length}
                      unit="chiến dịch"
                      onPageChange={setCampaignPage}
                      onPageSizeChange={(size) => {
                        setCampaignPageSize(size);
                        setCampaignPage(1);
                      }}
                    />
                  </>
                )}
              </section>

              {selected ? (
                <section className="overflow-hidden rounded-xl border border-border bg-card shadow-xs">
                  <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                    <h2 className="truncate text-sm font-semibold">
                      Theo ngày · {selected.objectName ?? selected.objectId}
                    </h2>
                    <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                      Bỏ chọn
                    </Button>
                  </div>
                  {/* MOBILE DAILY LIST (< 768px) */}
                  <div className="divide-y divide-border/70 md:hidden">
                    {pagedDailyRows.map((row) => (
                      <div key={row.date} className="flex items-center justify-between gap-2 px-3.5 py-2.5 text-xs">
                        <div>
                          <div className="font-semibold tabular-nums text-slate-900">{formatDate(row.date)}</div>
                          <div className="mt-0.5 text-[11px] tabular-nums text-muted-foreground">
                            {formatNumber(row.impressions ?? 0)} hiển thị · {formatNumber(row.clicks ?? 0)} click
                          </div>
                        </div>
                        <div className="text-right tabular-nums">
                          <div className="font-bold text-slate-900">{formatCurrency(row.spend ?? 0)}</div>
                          <div className="mt-0.5 text-[11px] font-semibold text-primary">
                            {formatNumber(row.leads ?? 0)} lead
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* DESKTOP & TABLET DAILY TABLE (>= 768px) */}
                  <div className="thin-scrollbar hidden overflow-x-auto md:block">
                    <table className="w-full min-w-[520px] text-left text-[13px]">
                      <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2.5 font-medium">Ngày</th>
                          <th className="px-3 py-2.5 text-right font-medium">Chi tiêu</th>
                          <th className="px-3 py-2.5 text-right font-medium">Hiển thị</th>
                          <th className="px-3 py-2.5 text-right font-medium">Click</th>
                          <th className="px-3 py-2.5 text-right font-medium">Lead</th>
                        </tr>
                      </thead>
                      <tbody>
                        {pagedDailyRows.map((row) => (
                          <tr key={row.date} className="border-b last:border-b-0">
                            <td className="px-3 py-2.5 tabular-nums">{formatDate(row.date)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(row.spend ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.impressions ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.clicks ?? 0)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.leads ?? 0)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <Pagination
                    page={safeDailyPage}
                    pageSize={dailyPageSize}
                    total={dailyRows.length}
                    unit="ngày"
                    onPageChange={setDailyPage}
                    onPageSizeChange={(size) => {
                      setDailyPageSize(size);
                      setDailyPage(1);
                    }}
                  />
                </section>
              ) : null}
            </>
          )}
        </>
      )}
    </div>
  );
}

function AdsManagerTitle({
  level,
  objectId,
  adAccountId,
  children,
}: {
  level: "campaign" | "ad";
  objectId: string;
  adAccountId: string | null;
  children: React.ReactNode;
}) {
  const href = adsManagerUrl(level, objectId, adAccountId);
  if (!href) return <span className="font-medium">{children}</span>;
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      title="Mở trên Facebook Ads"
      className="font-medium text-primary underline-offset-2 hover:underline"
      onClick={(event) => event.stopPropagation()}
    >
      {children}
    </a>
  );
}

function EfficiencyBadge({ value }: { value: Efficiency }) {
  return (
    <span
      className={cn(
        "inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium",
        value === "strong" && "bg-emerald-50 text-emerald-800",
        value === "average" && "bg-slate-100 text-slate-700",
        value === "weak" && "bg-rose-50 text-rose-800",
        value === "no_lead" && "bg-amber-50 text-amber-900",
      )}
    >
      {EFFICIENCY_LABEL[value]}
    </span>
  );
}

function Kpi({
  label,
  value,
  icon: Icon,
  className,
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
  className?: string;
}) {
  return (
    <div className={cn("min-w-0 rounded-xl border border-border bg-card px-3 py-2.5 shadow-xs sm:px-3.5 md:px-4 md:py-3", className)}>
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
        {Icon ? <Icon className="size-3.5 shrink-0 text-muted-foreground" /> : null}
      </div>
      <div className="mt-1 truncate text-lg font-bold tabular-nums sm:text-2xl">{value}</div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
  stickyLeft = false,
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
  stickyLeft?: boolean;
}) {
  const active = sort.key === sortKey;
  const Icon = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th
      className={cn(
        "px-3 py-2.5 font-medium whitespace-nowrap",
        align === "right" && "text-right",
        stickyLeft && "sticky left-0 z-10 bg-slate-50 shadow-[2px_0_6px_-2px_rgba(15,23,42,0.06)]",
      )}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          align === "right" && "ml-auto flex-row-reverse",
          active && "text-foreground",
        )}
      >
        {label}
        {active ? <Icon className="size-3" /> : null}
      </button>
    </th>
  );
}
