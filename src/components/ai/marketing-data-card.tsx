"use client";

import * as React from "react";
import { ExternalLink, Flame, Megaphone, TrendingUp } from "lucide-react";

import type { MarketingBreakdownRow } from "@/lib/db/insights-repo";
import { formatCurrency, formatNumber, formatPercent } from "@/lib/utils";

export function MarketingDataCard({ rows }: { rows: MarketingBreakdownRow[] }) {
  if (!rows || rows.length === 0) return null;

  const displayRows = rows.slice(0, 8);
  const maxLeads = Math.max(...displayRows.map((r) => r.leads), 1);

  return (
    <div className="mt-2.5 space-y-2 rounded-xl border border-border/80 bg-card p-3 shadow-xs">
      <div className="flex items-center justify-between border-b border-border/60 pb-2">
        <div className="flex items-center gap-1.5 text-[12.5px] font-semibold text-slate-900">
          <TrendingUp className="size-4 text-primary" />
          <span>Dữ liệu chi tiết & Liên kết quảng cáo</span>
        </div>
        <span className="text-[11px] text-muted-foreground">{displayRows.length} mục</span>
      </div>

      <div className="space-y-2.5 pt-1">
        {displayRows.map((row, index) => {
          const cpl = row.leads > 0 ? row.spend / row.leads : null;
          const ctr = row.impressions > 0 ? (row.clicks / row.impressions) * 100 : null;
          const widthPct = Math.max(8, Math.round((row.leads / maxLeads) * 100));

          return (
            <div
              key={`${row.key}-${index}`}
              className="group rounded-lg border border-border/70 bg-slate-50/60 p-2.5 transition-all hover:border-primary/40 hover:bg-white hover:shadow-xs"
            >
              {/* Tiêu đề mục & Rank badge */}
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    {index === 0 && row.leads > 0 && (
                      <span className="flex items-center gap-0.5 rounded bg-amber-100 px-1.5 py-0.2 text-[10px] font-semibold text-amber-800">
                        <Flame className="size-3 text-amber-600 fill-amber-500" />
                        Top 1
                      </span>
                    )}
                    <span className="font-semibold text-slate-800 text-[12.5px] leading-snug line-clamp-2">
                      {row.key}
                    </span>
                  </div>
                </div>

                {/* Badge số lead nổi bật */}
                <div className="shrink-0 text-right">
                  <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[12px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                    {formatNumber(row.leads)} lead
                  </span>
                </div>
              </div>

              {/* Progress bar so sánh lượng lead */}
              {row.leads > 0 && (
                <div className="mt-2 h-1.5 w-full rounded-full bg-slate-200/70 overflow-hidden">
                  <div
                    className="h-full rounded-full bg-emerald-500 transition-all duration-300"
                    style={{ width: `${widthPct}%` }}
                  />
                </div>
              )}

              {/* Lưới chỉ số (Chi tiêu, CPL, Click, CTR) */}
              <div className="mt-2 grid grid-cols-3 gap-1.5 rounded-md bg-white p-2 text-[11px] border border-border/50">
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Chi tiêu</div>
                  <div className="font-semibold text-slate-800">{formatCurrency(row.spend)}</div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">CPL (Chi phí/lead)</div>
                  <div className="font-semibold text-emerald-600">
                    {cpl !== null ? formatCurrency(cpl) : "—"}
                  </div>
                </div>
                <div>
                  <div className="text-[10px] text-muted-foreground uppercase font-medium">Click / CTR</div>
                  <div className="font-semibold text-slate-800">
                    {formatNumber(row.clicks)} {ctr !== null && `(${formatPercent(ctr)})`}
                  </div>
                </div>
              </div>

              {/* Nút liên kết trực tiếp (Facebook / CRM) */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5 pt-0.5 border-t border-border/40">
                {row.adUrl && (
                  <a
                    href={row.adUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-blue-200 bg-blue-50 px-2 py-1 text-[11px] font-medium text-blue-700 hover:bg-blue-100 transition-colors"
                  >
                    <Megaphone className="size-3" />
                    <span>Xem bài quảng cáo Facebook</span>
                    <ExternalLink className="size-2.5 opacity-70" />
                  </a>
                )}

                {row.crmUrl && (
                  <a
                    href={row.crmUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 rounded border border-slate-200 bg-white px-2 py-1 text-[11px] font-medium text-slate-700 hover:bg-slate-100 transition-colors"
                  >
                    <span>Xem trong CRM</span>
                    <ExternalLink className="size-2.5 opacity-60" />
                  </a>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > 8 && (
        <div className="pt-1 text-center text-[11px] text-muted-foreground">
          + {rows.length - 8} mục khác đã được tổng hợp trong số liệu.
        </div>
      )}
    </div>
  );
}
