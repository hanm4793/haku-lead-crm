"use client";

import * as React from "react";
import { BarChart3, Loader2, Table2, TriangleAlert, UserMinus } from "lucide-react";

import { updateLeadAction } from "@/app/leads/actions";
import { DateRangePicker, resolvePreset, type DateRange, type PresetId } from "@/components/common/date-range-picker";
import { LeadDetailDialog } from "@/components/leads/lead-detail-dialog";
import { LeadFilterPopover } from "@/components/leads/filter-popover";
import { useNow } from "@/components/providers/now-provider";
import { LossTab } from "@/components/reports/loss-tab";
import { OverviewTab } from "@/components/reports/overview-tab";
import { PivotTab } from "@/components/reports/pivot-tab";
import { ReportKpiCards } from "@/components/reports/report-kpi-cards";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useLeadLogs } from "@/hooks/use-lead-logs";
import { EMPTY_FILTERS } from "@/lib/filters";
import type { PivotDimension } from "@/lib/metrics";
import type { ReportSummary } from "@/lib/reports/summary";
import type { ActivityKind, Lead, LeadFilters } from "@/lib/types";

interface LogEntry {
  kind: ActivityKind;
  message: string;
}

export function ReportsPage({ initialSummary }: { initialSummary: ReportSummary }) {
  const now = useNow();

  const [preset, setPreset] = React.useState<PresetId>("THIS_MONTH");
  const [range, setRange] = React.useState<DateRange>(() => resolvePreset("THIS_MONTH", now));
  const [filters, setFilters] = React.useState<LeadFilters>(() => ({
    ...EMPTY_FILTERS,
    dateFrom: resolvePreset("THIS_MONTH", now).from,
    dateTo: resolvePreset("THIS_MONTH", now).to,
  }));
  const [groupBy, setGroupBy] = React.useState<PivotDimension>("carModel");
  const [splitBy, setSplitBy] = React.useState<PivotDimension | "NONE">("NONE");
  const [summary, setSummary] = React.useState(initialSummary);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [selectedLead, setSelectedLead] = React.useState<Lead | null>(null);
  const [callList, setCallList] = React.useState(initialSummary.overview.callList);

  const selectedId = selectedLead?.id ?? null;
  const { logs: selectedLogs, reload: reloadLogs } = useLeadLogs(selectedId);

  const liveSelected = selectedLead
    ? (callList.find((lead) => lead.id === selectedLead.id) ?? selectedLead)
    : null;

  const requestKey = JSON.stringify({
    filters,
    groupBy,
    splitBy: splitBy === "NONE" ? null : splitBy,
  });
  const skipFirstFetch = React.useRef(true);

  React.useEffect(() => {
    // Server đã hydrate sẵn bản đầu — bỏ qua lần effect đầu để tránh gọi API thừa.
    if (skipFirstFetch.current) {
      skipFirstFetch.current = false;
      return;
    }

    const controller = new AbortController();
    setLoading(true);
    setError(null);

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
        setSummary(data);
        setCallList(data.overview.callList);
      })
      .catch((err: unknown) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Lỗi không xác định");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [requestKey]);

  const save = async (lead: Lead, patch: Partial<Lead>, logs: LogEntry[]) => {
    const previous = callList;
    setCallList((rows) => rows.map((row) => (row.id === lead.id ? { ...row, ...patch } : row)));
    setSelectedLead((current) => (current?.id === lead.id ? { ...current, ...patch } : current));

    const result = await updateLeadAction({ id: lead.id, patch, logs });
    if (!result.ok) {
      setCallList(previous);
      setSelectedLead(lead);
      setError(result.error);
      return;
    }

    setCallList((rows) => rows.map((row) => (row.id === lead.id ? result.lead : row)));
    setSelectedLead(result.lead);
    reloadLogs();
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Báo cáo</h1>
          <p className="text-[13px] text-muted-foreground">Phân tích hiệu quả lead theo kênh &amp; tỷ lệ ký HĐ</p>
        </div>
        <div className="flex items-center gap-2">
          {loading && <Loader2 className="size-3.5 animate-spin text-muted-foreground" />}
          <LeadFilterPopover
            filters={filters}
            onChange={(patch) => setFilters((f) => ({ ...f, ...patch }))}
            onReset={() =>
              setFilters({
                ...EMPTY_FILTERS,
                dateFrom: range.from,
                dateTo: range.to,
              })
            }
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

      {error && (
        <div className="flex items-center gap-2 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[13px] text-rose-700">
          <TriangleAlert className="size-4 shrink-0" />
          {error}
        </div>
      )}

      <ReportKpiCards current={summary.kpis} previous={summary.previousKpis} />

      <Tabs defaultValue="overview">
        <TabsList className="border-b border-border">
          <TabsTrigger value="overview" className="gap-1.5">
            <BarChart3 className="size-3.5" />
            Tổng quan
          </TabsTrigger>
          <TabsTrigger value="loss" className="gap-1.5">
            <UserMinus className="size-3.5" />
            Vì sao mất khách
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
          />
        </TabsContent>
        <TabsContent value="loss" className="pt-4">
          <LossTab kpis={summary.kpis} data={summary.loss} />
        </TabsContent>
        <TabsContent value="pivot" className="pt-4">
          <PivotTab
            pivot={summary.pivot.current}
            pivotByDimension={summary.pivot.byDimension}
            groupBy={groupBy}
            splitBy={splitBy}
            onGroupByChange={setGroupBy}
            onSplitByChange={setSplitBy}
          />
        </TabsContent>
      </Tabs>

      <LeadDetailDialog
        lead={liveSelected}
        logs={selectedLogs}
        open={Boolean(liveSelected)}
        onOpenChange={(open) => !open && setSelectedLead(null)}
        onSave={(patch, entries) => liveSelected && void save(liveSelected, patch, entries)}
      />
    </div>
  );
}
