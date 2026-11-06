"use client";

import type { LeadKpis } from "@/lib/types";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

interface KpiCard {
  label: string;
  shortLabel: string;
  value: string;
  tone?: "default" | "positive" | "accent";
}

export function LeadKpiHeader({ kpis }: { kpis: LeadKpis }) {
  const cards: KpiCard[] = [
    { label: "Tổng lead", shortLabel: "Tổng lead", value: formatNumber(kpis.total) },
    { label: "Đã liên hệ", shortLabel: "Đã LH", value: formatNumber(kpis.contacted) },
    { label: "Tỷ lệ LH", shortLabel: "Tỷ lệ LH", value: formatPercent(kpis.contactRate, 0), tone: "positive" },
    { label: "KHQT", shortLabel: "KHQT", value: formatNumber(kpis.khqt), tone: "accent" },
    { label: "Tỷ lệ KHQT/đã liên hệ", shortLabel: "KHQT / Đã LH", value: formatPercent(kpis.khqtRate, 0) },
    { label: "GDTD", shortLabel: "GDTD", value: formatNumber(kpis.gdtd) },
  ];

  return (
    <div className="no-scrollbar -mx-3 flex gap-2 overflow-x-auto px-3 md:mx-0 md:grid md:grid-cols-3 md:gap-2.5 md:overflow-visible md:px-0 xl:grid-cols-6">
      {cards.map((card) => (
        <div
          key={card.label}
          className="min-w-[112px] shrink-0 rounded-xl border border-border bg-card px-3 py-2 shadow-2xs md:min-w-0 md:px-3.5 md:py-2.5"
        >
          <div className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            <span className="md:hidden">{card.shortLabel}</span>
            <span className="hidden md:inline">{card.label}</span>
          </div>
          <div
            className={cn(
              "mt-0.5 text-lg font-bold tabular-nums leading-tight md:mt-1 md:text-2xl",
              card.tone === "positive"
                ? "text-primary"
                : card.tone === "accent"
                  ? "text-emerald-700"
                  : "text-foreground",
            )}
          >
            {card.value}
          </div>
        </div>
      ))}
    </div>
  );
}
