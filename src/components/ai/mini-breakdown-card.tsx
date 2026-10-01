"use client";

import * as React from "react";
import { BarChart3 } from "lucide-react";

import type { StatsBreakdownRow } from "@/lib/ai/stats-query";
import { formatNumber, formatPercent } from "@/lib/utils";

export function MiniBreakdownCard({ rows }: { rows: StatsBreakdownRow[] }) {
  if (!rows || rows.length === 0) return null;

  const maxLeads = Math.max(...rows.map((r) => r.leads), 1);
  const displayRows = rows.slice(0, 6);

  return (
    <div className="mt-2 rounded-lg border border-border bg-card p-2.5 text-[12px] shadow-xs">
      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
        <BarChart3 className="size-3.5 text-primary" />
        <span>Biểu đồ tỷ lệ phân bổ</span>
      </div>

      <div className="mt-2 space-y-2">
        {displayRows.map((row) => {
          const widthPct = Math.max(8, Math.round((row.leads / maxLeads) * 100));
          const contactRate = row.contactRate ?? (row.leads > 0 ? row.contacted / row.leads : 0);
          const khqtRate =
            row.khqtRate ??
            (row.contacted > 0 ? row.khqt / row.contacted : row.leads > 0 ? row.khqt / row.leads : 0);

          return (
            <div key={row.key} className="space-y-0.5">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-medium text-slate-700 truncate max-w-[200px]" title={row.key}>
                  {row.key}
                </span>
                <span className="font-semibold text-slate-900">{formatNumber(row.leads)} lead</span>
              </div>

              {/* Progress bar so sánh quy mô */}
              <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                <div
                  className="h-full rounded-full bg-primary/80 transition-all duration-300"
                  style={{ width: `${widthPct}%` }}
                />
              </div>

              {/* Badges tỷ lệ chuyển đổi */}
              <div className="flex items-center gap-2 pt-0.5 text-[10px] text-muted-foreground">
                <span>
                  Đã LH: <strong className="text-blue-600">{formatPercent(contactRate)}</strong>
                </span>
                <span>•</span>
                <span>
                  KHQT: <strong className="text-emerald-600">{formatPercent(khqtRate)}</strong>
                </span>
                {row.failed > 0 && (
                  <>
                    <span>•</span>
                    <span>
                      Loại: <strong className="text-rose-500">{formatNumber(row.failed)}</strong>
                    </span>
                  </>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {rows.length > 6 && (
        <div className="mt-2 text-right text-[10px] text-muted-foreground">
          + {rows.length - 6} mục khác trong chi tiết
        </div>
      )}
    </div>
  );
}
