"use client";

import type { LeadKpis } from "@/lib/types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface KpiCard {
  label: string;
  value: string;
  tone?: "default" | "positive" | "warning";
}

export function LeadKpiHeader({ kpis }: { kpis: LeadKpis }) {
  const cards: KpiCard[] = [
    { label: "Tổng lead", value: formatNumber(kpis.total) },
    { label: "Đã liên hệ", value: formatNumber(kpis.contacted) },
    { label: "Tỷ lệ LH", value: formatPercent(kpis.contactRate, 0), tone: "positive" },
    { label: "KHQT", value: formatNumber(kpis.khqt) },
    { label: "Tỷ lệ KHQT/đã liên hệ", value: formatPercent(kpis.khqtRate, 0) },
    { label: "GDTD", value: formatNumber(kpis.gdtd) },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
      {cards.map((card) => (
        <div key={card.label} className="rounded-lg border border-border bg-card px-4 py-3 shadow-xs">
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {card.label}
          </div>
          <div
            className={cn(
              "mt-1 text-2xl font-bold tabular-nums",
              card.tone === "positive" ? "text-primary" : "text-foreground",
            )}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
