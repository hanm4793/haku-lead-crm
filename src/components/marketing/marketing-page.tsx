"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";

import { syncFacebookInsightsAction } from "@/app/settings/facebook-actions";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { InsightRow, InsightTotals } from "@/lib/db/insights-repo";

function metric(value: number | null, maximumFractionDigits = 2): string {
  return value === null
    ? "—"
    : new Intl.NumberFormat("vi-VN", { maximumFractionDigits }).format(value);
}

export function MarketingPage({
  rows,
  totals,
  hasSynced,
  configured,
  range,
}: {
  rows: InsightRow[];
  totals: InsightTotals;
  hasSynced: boolean;
  configured: boolean;
  range: { from: string; to: string };
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const [feedback, setFeedback] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

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
            Meta Ads theo chiến dịch · {range.from} — {range.to}
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

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Kpi label="Spend" value={metric(totals.spend)} />
        <Kpi label="Impressions" value={metric(totals.impressions, 0)} />
        <Kpi label="Clicks" value={metric(totals.clicks, 0)} />
        <Kpi label="Leads" value={metric(totals.leads, 0)} />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Hiệu quả chiến dịch theo ngày</CardTitle>
        </CardHeader>
        <CardContent>
          {rows.length === 0 ? (
            <div className="rounded-lg border border-dashed p-10 text-center text-sm text-muted-foreground">
              {hasSynced
                ? "Không có dữ liệu Insights trong 30 ngày gần nhất."
                : "Chưa có dữ liệu Insights — bấm Đồng bộ"}
            </div>
          ) : (
            <div className="overflow-x-auto rounded-lg border">
              <table className="w-full min-w-[760px] text-left text-[13px]">
                <thead className="border-b bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-3 py-2.5 font-medium">Ngày</th>
                    <th className="px-3 py-2.5 font-medium">Chiến dịch</th>
                    <th className="px-3 py-2.5 text-right font-medium">Spend</th>
                    <th className="px-3 py-2.5 text-right font-medium">Impressions</th>
                    <th className="px-3 py-2.5 text-right font-medium">Clicks</th>
                    <th className="px-3 py-2.5 text-right font-medium">Leads</th>
                    <th className="px-3 py-2.5 text-right font-medium">CPL</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr
                      key={`${row.objectId}-${row.date}`}
                      className="border-b last:border-b-0 hover:bg-muted/30"
                    >
                      <td className="whitespace-nowrap px-3 py-2.5">{row.date}</td>
                      <td className="px-3 py-2.5 font-medium">{row.objectName ?? row.objectId}</td>
                      <td className="px-3 py-2.5 text-right">{metric(row.spend)}</td>
                      <td className="px-3 py-2.5 text-right">
                        {metric(row.impressions, 0)}
                      </td>
                      <td className="px-3 py-2.5 text-right">{metric(row.clicks, 0)}</td>
                      <td className="px-3 py-2.5 text-right">{metric(row.leads, 0)}</td>
                      <td className="px-3 py-2.5 text-right">{metric(row.costPerLead)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="mt-1 text-2xl font-bold text-slate-900">{value}</p>
      </CardContent>
    </Card>
  );
}
