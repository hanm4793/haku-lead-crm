"use client";

import * as React from "react";
import { BarChart3, Loader2, RefreshCw, RotateCcw, Table2 } from "lucide-react";

import { updateLeadAction } from "@/app/leads/actions";
import { DateRangePicker, resolvePreset, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { ProjectSwitcher } from "@/components/layout/project-switcher";
import { LeadDetailDialog } from "@/components/leads/lead-detail-dialog";
import { LeadFilterPopover, type FanpageFilterOption } from "@/components/leads/filter-popover";
import { useNow } from "@/components/providers/now-provider";
import { useToast } from "@/components/providers/toast-provider";
import { OverviewTab } from "@/components/reports/overview-tab";
import { PivotTab } from "@/components/reports/pivot-tab";
import { ReportKpiCards } from "@/components/reports/report-kpi-cards";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadLogs } from "@/hooks/use-lead-logs";
import { canEditLead, canEditLeadProfile, type UserRole } from "@/lib/auth/roles";
import { DEFAULT_LEAD_CATALOG, type LeadCatalogOptions } from "@/lib/catalog";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import { countActiveFilters, EMPTY_FILTERS } from "@/lib/filters";
import type { PivotDimension } from "@/lib/metrics";
import type { ReportSummary } from "@/lib/reports/summary";
import type { ActivityKind, Lead, LeadFilters } from "@/lib/types";
import { cn, formatDateTime } from "@/lib/utils";

interface LogEntry {
  kind: ActivityKind;
  message: string;
}

export function ReportsPage({
  initialSummary,
  fanpageOptions = [],
  assignees = [],
  catalog = DEFAULT_LEAD_CATALOG,
  attrFields = [],
  editor,
}: {
  initialSummary: ReportSummary;
  fanpageOptions?: FanpageFilterOption[];
  assignees?: string[];
  catalog?: LeadCatalogOptions;
  attrFields?: AttrFieldRow[];
  editor?: { role: UserRole; appUserId?: string | null };
}) {
  const now = useNow();
  const toast = useToast();

  const [preset, setPreset] = React.useState<PresetId>("THIS_MONTH");
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset("THIS_MONTH", now));
  const [filters, setFilters] = React.useState<LeadFilters>(() => ({
    ...EMPTY_FILTERS,
    dateFrom: resolvePreset("THIS_MONTH", now).from,
    dateTo: resolvePreset("THIS_MONTH", now).to,
  }));
  const [groupBy, setGroupBy] = React.useState<PivotDimension>("source");
  const [splitBy, setSplitBy] = React.useState<PivotDimension | "NONE">("NONE");
  const [summary, setSummary] = React.useState(initialSummary);
  const [callList, setCallList] = React.useState(initialSummary.overview.callList);
  const [prevInitialSummary, setPrevInitialSummary] = React.useState(initialSummary);
  const [hydratedVersion, setHydratedVersion] = React.useState(0);
  const [loading, setLoading] = React.useState(false);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [refreshTick, setRefreshTick] = React.useState(0);

  const selectedId = selectedLead?.id ?? null;
  const { detailLead, logs: selectedLogs, loading: logsLoading, reload: reloadLogs } = useLeadLogs(selectedId);

  const liveSelected = selectedLead
    ? (() => {
        const base = callList.find((lead) => lead.id === selectedLead.id) ?? selectedLead;
        return detailLead && detailLead.id === base.id
          ? { ...detailLead, ...base, attrs: detailLead.attrs }
          : base;
      })()
    : null;
  const leadEditable = (lead: Lead) => (editor ? canEditLead(editor, { assigneeId: lead.assigneeId }) : true);
  const leadProfileEditable = (lead: Lead) =>
    editor ? canEditLeadProfile(editor, lead) : lead.source === "MANUAL";

  const filterCount = countActiveFilters(filters);

  const requestKey = JSON.stringify({
    filters,
    groupBy,
    splitBy: splitBy === "NONE" ? null : splitBy,
  });
  const fetchSignature = `${requestKey}|${refreshTick}`;
  const lastFetchedSignature = React.useRef(fetchSignature);
  const lastHydratedVersion = React.useRef(0);

  if (prevInitialSummary !== initialSummary) {
    setPrevInitialSummary(initialSummary);
    setSummary(initialSummary);
    setCallList(initialSummary.overview.callList);
    setHydratedVersion((v) => v + 1);
  }

  React.useEffect(() => {
    if (lastHydratedVersion.current !== hydratedVersion) {
      lastHydratedVersion.current = hydratedVersion;
      lastFetchedSignature.current = fetchSignature;
      return;
    }
    // Server đã hydrate sẵn bản đầu — bỏ qua nếu chữ ký truy vấn chưa đổi.
    if (lastFetchedSignature.current === fetchSignature) return;

    const controller = new AbortController();
    setLoading(true);

    fetch("/api/reports/summary", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: requestKey,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Không tải được báo cáo");
        return response.json() as Promise<ReportSummary>;
      })
      .then((data) => {
        if (controller.signal.aborted) return;
        lastFetchedSignature.current = fetchSignature;
        setSummary(data);
        setCallList(data.overview.callList);
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted || (err instanceof DOMException && err.name === "AbortError")) return;
        toast.error("Không tải được báo cáo", err instanceof Error ? err.message : "Lỗi không xác định");
      })
      .finally(() => {
        if (!controller.signal.aborted) {
          setLoading(false);
        }
      });

    return () => controller.abort();
  }, [requestKey, fetchSignature, hydratedVersion, toast]);

  const save = async (lead: Lead, patch: Partial<Lead>, logs: LogEntry[]): Promise<boolean> => {
    const previous = callList;
    setCallList((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...patch } : row)));
    setSelectedLead((current) => (current?.id === lead.id ? { ...current, ...patch } : current));

    const result = await updateLeadAction({ id: lead.id, patch, logs });
    if (!result.ok) {
      setCallList(previous);
      setSelectedLead(lead);
      toast.error("Không lưu được thay đổi", result.error);
      return false;
    }

    setCallList((rows) => rows.map((row) => (row.id === lead.id ? result.lead : row)));
    setSelectedLead(result.lead);
    reloadLogs();
    setRefreshTick((t) => t + 1);
    toast.success("Đã lưu thay đổi");
    return true;
  };

  const resetAllFilters = () => {
    setFilters({
      ...EMPTY_FILTERS,
      dateFrom: range.from,
      dateTo: range.to,
    });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo</h1>
          <p className="text-[13px] text-muted-foreground">
            Phân tích hiệu quả lead theo kênh, lý do loại, hiệu suất đội ngũ Sale &amp; tỷ lệ ký HĐ
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {summary.lastUpdatedAt && (
            <button
              type="button"
              onClick={() => setRefreshTick((t) => t + 1)}
              title="Nhấn để làm mới số liệu báo cáo"
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-emerald-500/25 bg-emerald-500/8 px-2.5 text-[11px] font-medium text-emerald-700 transition-colors hover:bg-emerald-500/15"
            >
              <span className="size-1.5 rounded-full bg-emerald-500" />
              <span>Cập nhật mới nhất: {formatDateTime(summary.lastUpdatedAt)}</span>
              <RefreshCw className={cn("size-3 opacity-70", loading && "animate-spin")} />
            </button>
          )}
          {!summary.lastUpdatedAt && loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          {filterCount > 0 && (
            <Button variant="ghost" size="sm" className="gap-1.5 text-xs text-muted-foreground" onClick={resetAllFilters}>
              <RotateCcw className="size-3.5" />
              Xóa lọc ({filterCount})
            </Button>
          )}
          <ProjectSwitcher />
          <LeadFilterPopover
            filters={filters}
            fanpageOptions={fanpageOptions}
            assigneeOptions={assignees}
            catalog={catalog}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onReset={resetAllFilters}
          />
          <DateRangePicker
            preset={preset}
            range={range}
            onChange={(nextPreset, nextRange) => {
              setPreset(nextPreset);
              const resolved = nextPreset === "CUSTOM" ? nextRange : resolvePreset(nextPreset, now);
              setRange(resolved);
              setFilters((f) => ({ ...f, dateFrom: resolved.from, dateTo: resolved.to }));
            }}
          />
        </div>
      </div>

      <div className="relative">
        {loading && (
          <div
            role="status"
            aria-live="polite"
            className="absolute inset-0 z-30 flex cursor-wait items-start justify-center rounded-xl bg-white/55 pt-28 backdrop-blur-[1px]"
          >
            <div className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-2.5 text-xs font-medium text-foreground shadow-md">
              <Loader2 className="size-4 shrink-0 animate-spin text-primary" />
              <span>Đang tải dữ liệu báo cáo...</span>
            </div>
          </div>
        )}
        <div className={cn("space-y-4 transition-opacity", loading && "pointer-events-none select-none opacity-60")}>
        <ReportKpiCards current={summary.kpis} previous={summary.previousKpis} />

        <Tabs defaultValue="overview">
          <TabsList className="border-b border-border">
            <TabsTrigger value="overview" className="gap-1.5">
              <BarChart3 className="size-3.5" />
              Tổng quan
            </TabsTrigger>
            <TabsTrigger value="pivot" className="gap-1.5">
              <Table2 className="size-3.5" />
              Bảng chi tiết
            </TabsTrigger>
          </TabsList>

          <TabsContent value="overview" className="pt-4">
            <OverviewTab
              data={{ ...summary.overview, callList }}
              totalLeads={summary.totalLeads}
              onSelectLead={setSelectedLead}
              labels={catalog.labels}
            />
          </TabsContent>
          <TabsContent value="pivot" className="pt-4">
            <PivotTab
              pivot={summary.pivot.current}
              pivotByDimension={summary.pivot.byDimension}
              groupBy={groupBy}
              splitBy={splitBy}
              onGroupByChange={setGroupBy}
              onSplitByChange={setSplitBy}
              labels={catalog.labels}
            />
          </TabsContent>
        </Tabs>
        </div>
      </div>

      <LeadDetailDialog
        lead={liveSelected}
        logs={selectedLogs}
        logsLoading={logsLoading}
        open={Boolean(liveSelected)}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        assignees={assignees}
        catalog={catalog}
        attrFields={attrFields}
        readOnly={liveSelected ? !leadEditable(liveSelected) : false}
        canEditProfile={liveSelected ? leadProfileEditable(liveSelected) : false}
        onSave={(patch, entries) =>
          liveSelected && leadEditable(liveSelected) ? save(liveSelected, patch, entries) : false
        }
      />
    </div>
  );
}
