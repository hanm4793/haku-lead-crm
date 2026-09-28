"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ArrowDown, ArrowUp, MousePointerClick, RefreshCw, Search, Wallet, X } from "lucide-react";
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
import { DateRangePicker, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MultiSelect } from "@/components/ui/multi-select";
import type { AdInsightRow, InsightRow } from "@/lib/db/insights-repo";
import { adsManagerUrl } from "@/lib/facebook/ads-manager-url";
import {
  attachEfficiency,
  CAMPAIGN_BRANDS,
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
  summarizePages,
  type CampaignBrandId,
  type CampaignSummary,
  type Efficiency,
} from "@/lib/marketing/insights-view";
import { cn, formatCurrency, formatDate, formatDateTime, formatNumber, formatPercent } from "@/lib/utils";

const AXIS_STYLE = { fontSize: 11, fill: "#94a3b8" } as const;
const GRID_COLOR = "#e2e8f0";

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
  pages,
  hasSynced,
  configured,
  adAccountId,
  syncedAt,
  today,
}: {
  rows: InsightRow[];
  adRows: AdInsightRow[];
  pages: MarketingPageOption[];
  hasSynced: boolean;
  configured: boolean;
  adAccountId: string | null;
  syncedAt: string | null;
  today: string;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [preset, setPreset] = React.useState<PresetId>("ALL");
  const [range, setRange] = React.useState<DateRange>({ from: null, to: null });
  const [campaignIds, setCampaignIds] = React.useState<string[]>([]);
  const [pageIds, setPageIds] = React.useState<string[]>([]);
  const [brands, setBrands] = React.useState<CampaignBrandId[]>([]);
  const [query, setQuery] = React.useState("");
  const [selectedId, setSelectedId] = React.useState<string | null>(null);
  const [sort, setSort] = React.useState<{ key: SortKey; direction: "asc" | "desc" }>({
    key: "spend",
    direction: "desc",
  });

  const span = React.useMemo(() => storedSpan(rows), [rows]);
  const pageCampaignIds = React.useMemo(() => {
    if (pageIds.length === 0) return null;
    const ids = new Set<string>();
    for (const row of adRows) {
      if (!pageIds.includes(row.pageId ?? "") || !row.campaignId) continue;
      ids.add(row.campaignId);
    }
    return ids;
  }, [adRows, pageIds]);
  const campaignOptions = React.useMemo(() => {
    const entries = new Map<string, string>();
    for (const row of rows) {
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
  }, [rows, adRows, pageCampaignIds]);
  const pageOptions = React.useMemo(() => {
    const official = new Map(pages.map((page) => [page.id, page.name?.trim() || null]));
    const namesByPage = new Map<string, Array<string | null>>();
    for (const row of adRows) {
      const pageId = row.pageId ?? "";
      const names = namesByPage.get(pageId) ?? [];
      names.push(row.campaignName);
      namesByPage.set(pageId, names);
    }
    for (const pageId of official.keys()) {
      if (!namesByPage.has(pageId)) namesByPage.set(pageId, []);
    }
    return [...namesByPage.entries()]
      .map(([value, names]) => ({
        value,
        label: official.get(value) || pageLabelFromCampaigns(names) || (value ? value : "Chưa gắn fanpage"),
      }))
      .sort((left, right) => left.label.localeCompare(right.label, "vi"));
  }, [pages, adRows]);

  const adScope = React.useMemo(
    () =>
      filterAdRows(adRows, {
        from: range.from,
        to: range.to,
        campaignIds,
        brands,
        query,
        pageIds: [],
      }),
    [adRows, range.from, range.to, campaignIds, brands, query],
  );
  const visibleAds = pageIds.length === 0 ? adScope : adScope.filter((row) => pageIds.includes(row.pageId ?? ""));
  const filteredCampaigns = React.useMemo(
    () =>
      filterInsightRows(rows, {
        from: range.from,
        to: range.to,
        campaignIds,
        brands,
        query,
      }),
    [rows, range.from, range.to, campaignIds, brands, query],
  );
  const campaignSummaries = (
    pageIds.length > 0 ? summarizeCampaignsFromAds(visibleAds) : summarizeCampaigns(filteredCampaigns)
  ).filter((campaign) => !pageCampaignIds || pageCampaignIds.has(campaign.objectId));
  if (pageCampaignIds && campaignIds.some((id) => !pageCampaignIds.has(id))) {
    setCampaignIds(campaignIds.filter((id) => pageCampaignIds.has(id)));
  }
  const ratedCampaigns = attachEfficiency(campaignSummaries);
  const selectionVisible = selectedId !== null && campaignSummaries.some((campaign) => campaign.objectId === selectedId);
  if (selectedId && !selectionVisible) setSelectedId(null);
  const activeId = selectionVisible ? selectedId : null;
  const chartRows = pageIds.length > 0
    ? visibleAds.filter((row) => (activeId ? row.campaignId === activeId : true))
    : filteredCampaigns.filter((row) => (activeId ? row.objectId === activeId : true));
  const totals = dashboardTotals(chartRows);
  const series = seriesByDate(chartRows);
  const campaigns = ratedCampaigns.items.sort((left, right) => compareCampaigns(left, right, sort.key, sort.direction));
  const maxSpend = Math.max(...campaigns.map((campaign) => campaign.spend), 1);
  const selected = campaigns.find((campaign) => campaign.objectId === activeId) ?? null;
  const ratedPages = attachEfficiency(summarizePages(adScope));
  const adsInCampaign = selected
    ? attachEfficiency(summarizeAds(visibleAds.filter((row) => row.campaignId === selected.objectId)))
    : null;
  const dailyRows = selected
    ? seriesByDate(chartRows).slice().sort((left, right) => right.date.localeCompare(left.date))
    : [];
  const filtersActive =
    preset !== "ALL" ||
    campaignIds.length > 0 ||
    pageIds.length > 0 ||
    brands.length > 0 ||
    query.trim().length > 0 ||
    selectedId !== null;

  function applyRange(nextPreset: PresetId, nextRange: DateRange) {
    setPreset(nextPreset);
    setRange(nextRange);
  }

  function toggleBrand(brand: CampaignBrandId) {
    setBrands((current) => (current.includes(brand) ? current.filter((item) => item !== brand) : [...current, brand]));
  }

  function toggleSort(key: SortKey) {
    setSort((current) =>
      current.key === key
        ? { key, direction: current.direction === "asc" ? "desc" : "asc" }
        : { key, direction: key === "name" ? "asc" : "desc" },
    );
  }

  function clearFilters() {
    setPreset("ALL");
    setRange({ from: null, to: null });
    setCampaignIds([]);
    setPageIds([]);
    setBrands([]);
    setQuery("");
    setSelectedId(null);
  }

  async function sync() {
    setPending(true);
    setFeedback(null);
    setError(null);
    try {
      const outcome = await syncFacebookInsightsAction();
      if (!outcome.ok) {
        setError(outcome.error);
        return;
      }
      setFeedback(outcome.result.message);
      router.refresh();
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Marketing</h1>
          <p className="text-[13px] text-muted-foreground">
            Meta Ads theo fanpage, chiến dịch và ads
            {span.from && span.to ? ` · dữ liệu ${formatDate(span.from)} – ${formatDate(span.to)}` : ""}
            {syncedAt ? ` · đồng bộ ${formatDateTime(syncedAt)}` : ""}
          </p>
        </div>
        <Button type="button" disabled={pending || !configured} onClick={() => void sync()}>
          <RefreshCw className={pending ? "animate-spin" : undefined} />
          {pending ? "Đang đồng bộ…" : "Đồng bộ Insights"}
        </Button>
      </div>

      {!configured ? (
        <p className="text-sm text-amber-800" role="alert">
          Thiếu FACEBOOK_AD_ACCOUNT_ID — cấu hình biến môi trường để đồng bộ Insights.
        </p>
      ) : null}
      {span.to && span.to < today ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-[13px] text-amber-900" role="status">
          Số liệu đã lưu đến {formatDate(span.to)}. Các ngày sau đó chưa có — bấm Đồng bộ Insights để kéo nốt.
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-rose-700" role="alert">
          {error}
        </p>
      ) : null}
      {feedback ? (
        <p className="text-sm text-emerald-800" role="status">
          {feedback}
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        <DateRangePicker preset={preset} range={range} onChange={applyRange} />
        <MultiSelect
          options={pageOptions}
          selected={pageIds}
          onChange={setPageIds}
          placeholder="Tất cả fanpage"
          className="h-8 w-[200px] text-[13px]"
          contentClassName="w-[280px]"
        />
        <MultiSelect
          options={campaignOptions}
          selected={campaignIds}
          onChange={setCampaignIds}
          placeholder="Tất cả chiến dịch"
          className="h-8 w-[240px] text-[13px]"
          contentClassName="w-[360px]"
        />
        <div className="relative">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Tìm chiến dịch, ads…"
            className="h-8 w-[220px] pl-8 text-[13px]"
            aria-label="Tìm chiến dịch"
          />
        </div>
        {filtersActive ? (
          <Button type="button" variant="ghost" size="sm" onClick={clearFilters}>
            <X />
            Xóa lọc
          </Button>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {CAMPAIGN_BRANDS.map((brand) => {
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
      <p className="text-[12px] text-muted-foreground">
        Hiệu quả so với CPL trung vị của các mục đang có lead trong bộ lọc hiện tại
        {ratedCampaigns.benchmark != null ? ` (${formatCurrency(ratedCampaigns.benchmark)})` : ""}
        . Thấp hơn hoặc bằng trung vị là Hiệu quả, chưa tới 1,5 lần là Trung bình, cao hơn là Kém. Đã chi mà không có lead thì là Chưa ra lead.
      </p>

      {rows.length === 0 ? (
        <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
          {hasSynced ? "Không có dữ liệu Insights." : "Chưa có dữ liệu Insights — bấm Đồng bộ"}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
            <Kpi label="Chi tiêu" value={totals.spend === null ? "—" : formatCurrency(totals.spend)} icon={Wallet} />
            <Kpi label="Hiển thị" value={totals.impressions === null ? "—" : formatNumber(totals.impressions)} />
            <Kpi label="Lượt click" value={totals.clicks === null ? "—" : formatNumber(totals.clicks)} icon={MousePointerClick} />
            <Kpi label="CTR" value={totals.ctr === null ? "—" : formatPercent(totals.ctr)} />
            <Kpi label="Lead" value={totals.leads === null ? "—" : formatNumber(totals.leads)} />
            <Kpi label="CPL" value={totals.cpl === null ? "—" : formatCurrency(totals.cpl)} />
          </div>

          <section className="rounded-lg border border-border bg-card p-4 shadow-xs">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="text-sm font-semibold">
                {selected ? selected.objectName ?? selected.objectId : "Chi tiêu và lead theo ngày"}
              </h2>
              <p className="text-[12px] text-muted-foreground">Bấm một cột để khoanh đúng ngày đó</p>
            </div>
            {series.length === 0 ? (
              <p className="py-16 text-center text-sm text-muted-foreground">Không có ngày nào khớp bộ lọc.</p>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart
                  data={series}
                  margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
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
                    width={48}
                    tickFormatter={compactMoney}
                  />
                  <YAxis
                    yAxisId="leads"
                    orientation="right"
                    tick={AXIS_STYLE}
                    tickLine={false}
                    axisLine={false}
                    width={32}
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

          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Theo fanpage</h2>
              <p className="text-[12px] text-muted-foreground">Bấm một fanpage để chỉ xem data của page đó</p>
            </div>
            {adRows.length === 0 ? (
              <p className="px-4 py-8 text-center text-sm text-muted-foreground">
                Chưa có dữ liệu từng ads — bấm Đồng bộ Insights để gắn fanpage và ads.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-left text-[13px]">
                  <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2.5 font-medium">Fanpage</th>
                      <th className="px-3 py-2.5 text-right font-medium">Chi tiêu</th>
                      <th className="px-3 py-2.5 text-right font-medium">Lead</th>
                      <th className="px-3 py-2.5 text-right font-medium">CPL</th>
                      <th className="px-3 py-2.5 text-right font-medium">CTR</th>
                      <th className="px-3 py-2.5 text-right font-medium">Hiệu quả</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ratedPages.items
                      .slice()
                      .sort((left, right) => right.spend - left.spend)
                      .map((page) => {
                        const active = pageIds.length === 1 && pageIds[0] === page.pageId;
                        const label =
                          pageOptions.find((option) => option.value === page.pageId)?.label ?? "Chưa gắn fanpage";
                        return (
                          <tr
                            key={page.pageId || "unknown"}
                            className={cn(
                              "cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                              active && "bg-accent",
                            )}
                            onClick={() => setPageIds(active ? [] : [page.pageId])}
                          >
                            <td className="px-3 py-2.5 font-medium">{label}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(page.spend)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(page.leads)}</td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {page.cpl === null ? "—" : formatCurrency(page.cpl)}
                            </td>
                            <td className="px-3 py-2.5 text-right tabular-nums">
                              {page.ctr === null ? "—" : formatPercent(page.ctr)}
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
            )}
          </section>

          <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
            <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
              <h2 className="text-sm font-semibold">Hiệu quả theo chiến dịch</h2>
              <p className="text-[12px] text-muted-foreground">
                {pageIds.length > 0
                  ? `${campaigns.length} chiến dịch của fanpage đang chọn`
                  : `${campaigns.length} chiến dịch`}
                {" · bấm Xem ads để mở từng ads"}
              </p>
            </div>
            {campaigns.length === 0 ? (
              <p className="px-4 py-10 text-center text-sm text-muted-foreground">Không có chiến dịch khớp bộ lọc.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[860px] text-left text-[13px]">
                  <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                    <tr>
                      <SortHeader label="Chiến dịch" sortKey="name" sort={sort} onSort={toggleSort} />
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
                    {campaigns.map((campaign) => (
                      <React.Fragment key={campaign.objectId}>
                        <tr
                          className={cn(
                            "cursor-pointer border-b last:border-b-0 hover:bg-muted/40",
                            campaign.objectId === activeId && "bg-accent",
                          )}
                          onClick={() => setSelectedId(campaign.objectId === activeId ? null : campaign.objectId)}
                        >
                          <td className="px-3 py-2.5">
                            <AdsManagerTitle level="campaign" objectId={campaign.objectId} adAccountId={adAccountId}>
                              {campaign.objectName ?? campaign.objectId}
                            </AdsManagerTitle>
                            <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                              <div
                                className="h-full rounded-full bg-primary"
                                style={{ width: `${Math.max(2, (campaign.spend / maxSpend) * 100)}%` }}
                              />
                            </div>
                            <span className="mt-1.5 inline-block text-[12px] font-medium text-primary">
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
                                <p className="text-sm text-muted-foreground">Chiến dịch này chưa có dòng ads trong bộ lọc.</p>
                              ) : (
                                <table className="w-full min-w-[760px] text-left text-[13px]">
                                  <thead className="text-xs text-muted-foreground">
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
                                            <AdsManagerTitle level="ad" objectId={ad.objectId} adAccountId={adAccountId}>
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
                              )}
                            </td>
                          </tr>
                        ) : null}
                      </React.Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          {selected ? (
            <section className="overflow-hidden rounded-lg border border-border bg-card shadow-xs">
              <div className="flex items-center justify-between gap-3 border-b border-border px-4 py-3">
                <h2 className="text-sm font-semibold">Theo ngày · {selected.objectName ?? selected.objectId}</h2>
                <Button type="button" variant="ghost" size="sm" onClick={() => setSelectedId(null)}>
                  Bỏ chọn
                </Button>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-[13px]">
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
                    {dailyRows.map((row) => (
                      <tr key={row.date} className="border-b last:border-b-0">
                        <td className="px-3 py-2.5">{formatDate(row.date)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatCurrency(row.spend ?? 0)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.impressions ?? 0)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.clicks ?? 0)}</td>
                        <td className="px-3 py-2.5 text-right tabular-nums">{formatNumber(row.leads ?? 0)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          ) : null}
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
        "inline-flex rounded-full px-2 py-0.5 text-[11px] font-medium",
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
}: {
  label: string;
  value: string;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3 shadow-xs">
      <div className="flex items-center justify-between gap-2">
        <div className="truncate text-[10px] font-semibold tracking-wide text-muted-foreground uppercase">{label}</div>
        {Icon ? <Icon className="size-3.5 text-muted-foreground" /> : null}
      </div>
      <div className="mt-1 truncate text-2xl font-bold tabular-nums">{value}</div>
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = "left",
}: {
  label: string;
  sortKey: SortKey;
  sort: { key: SortKey; direction: "asc" | "desc" };
  onSort: (key: SortKey) => void;
  align?: "left" | "right";
}) {
  const active = sort.key === sortKey;
  const Icon = sort.direction === "asc" ? ArrowUp : ArrowDown;
  return (
    <th className={cn("px-3 py-2.5 font-medium", align === "right" && "text-right")}>
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
