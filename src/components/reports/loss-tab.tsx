"use client";

import { LossReasonBars } from "@/components/reports/charts";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { ReportSummary } from "@/lib/reports/summary";
import type { LeadKpis } from "@/lib/types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

export function LossTab({ kpis, data }: { kpis: LeadKpis; data: ReportSummary["loss"] }) {
  const { reasons, sourceQuality } = data;

  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-3">
        <MiniKpi label="Khách bị loại" value={formatNumber(kpis.failed)} tone="danger" />
        <MiniKpi label="Tỷ lệ mất khách" value={formatPercent(kpis.failRate)} tone="danger" />
        <MiniKpi label="Tổng lead trong kỳ" value={formatNumber(kpis.total)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Vì sao mất khách</CardTitle>
          <CardDescription>Phân rã lý do khách bị loại trong kỳ</CardDescription>
        </CardHeader>
        <CardContent>
          <LossReasonBars data={reasons} />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Hiệu quả nguồn / kênh</CardTitle>
          <CardDescription>Tỷ lệ ký HĐ và tỷ lệ mất khách theo nguồn — mũi tên so với kỳ trước</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-border">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="bg-[#f8fafc] text-[11px] uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 text-left font-semibold">Nguồn</th>
                  <th className="px-3 py-2 text-right font-semibold">Lead</th>
                  <th className="px-3 py-2 text-right font-semibold">KHQT</th>
                  <th className="px-3 py-2 text-right font-semibold">Ký HĐ</th>
                  <th className="px-3 py-2 text-right font-semibold">Tỷ lệ chốt</th>
                  <th className="px-3 py-2 text-right font-semibold">Tỷ lệ mất</th>
                </tr>
              </thead>
              <tbody>
                {sourceQuality.map((row) => (
                  <tr key={row.source} className="border-t border-border/70">
                    <td className="px-3 py-2 font-medium text-slate-800">{row.source}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.leads)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.khqt)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{formatNumber(row.signed)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">
                      {formatPercent(row.closeRate)}
                      {Math.abs(row.closeRateDelta) > 0.05 && (
                        <span className={cn("ml-1.5 text-[11px]", row.closeRateDelta > 0 ? "text-emerald-600" : "text-rose-600")}>
                          {row.closeRateDelta > 0 ? "▲" : "▼"} {formatPercent(Math.abs(row.closeRateDelta))}
                        </span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right tabular-nums text-rose-600">{formatPercent(row.lossRate)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function MiniKpi({ label, value, tone }: { label: string; value: string; tone?: "danger" }) {
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-xs">
      <div className="text-[11px] font-medium text-muted-foreground">{label}</div>
      <div className={cn("mt-1 text-2xl font-bold tabular-nums", tone === "danger" && "text-rose-600")}>{value}</div>
    </div>
  );
}
