"use client";

import { AlertCircle, Award, CheckCircle2, Percent, PhoneCall, PhoneOff, Users } from "lucide-react";

import type { LeadKpis } from "@/lib/types";
import { cn, formatNumber, formatPercent, ratio } from "@/lib/utils";

interface Card {
  label: string;
  value: string;
  delta: number | null;
  /** Đơn vị của delta: số tuyệt đối hay điểm phần trăm. */
  deltaKind: "count" | "point";
  icon: React.ComponentType<{ className?: string }>;
  /** Tăng là xấu (vd. chưa LH) — đảo màu delta. */
  invertDelta?: boolean;
  /** Phụ đề cố định thay cho delta (dùng cho chỉ số tồn đọng thời điểm hiện tại). */
  subtext?: string;
}

export function ReportKpiCards({ current, previous }: { current: LeadKpis; previous: LeadKpis | null }) {
  const signRate = ratio(current.khd, current.total);
  const cards: Card[] = [
    {
      label: "Tổng lead",
      value: formatNumber(current.total),
      delta: previous ? current.total - previous.total : null,
      deltaKind: "count",
      icon: Users,
    },
    {
      label: "Chưa liên hệ",
      value: formatNumber(current.uncontacted),
      delta: previous ? current.uncontacted - previous.uncontacted : null,
      deltaKind: "count",
      icon: PhoneOff,
      invertDelta: true,
    },
    {
      label: "Đã liên hệ",
      value: formatNumber(current.contacted),
      delta: previous ? current.contacted - previous.contacted : null,
      deltaKind: "count",
      icon: PhoneCall,
    },
    {
      label: "Tỷ lệ LH",
      value: formatPercent(current.contactRate),
      delta: previous ? current.contactRate - previous.contactRate : null,
      deltaKind: "point",
      icon: Percent,
    },
    {
      label: "KHQT+",
      value: formatNumber(current.khqt),
      delta: previous ? current.khqt - previous.khqt : null,
      deltaKind: "count",
      icon: CheckCircle2,
    },
    {
      label: "KHQT+ / đã LH",
      value: formatPercent(current.khqtRate),
      delta: previous ? current.khqtRate - previous.khqtRate : null,
      deltaKind: "point",
      icon: CheckCircle2,
    },
    {
      label: "Ký hợp đồng (KHĐ)",
      value: formatNumber(current.khd),
      delta: previous ? current.khd - previous.khd : null,
      deltaKind: "count",
      icon: Award,
      subtext: `Tỷ lệ chốt: ${formatPercent(signRate)}`,
    },
    {
      label: "Quá hạn cần gọi",
      value: formatNumber(current.overdue),
      delta: null,
      deltaKind: "count",
      icon: AlertCircle,
      invertDelta: true,
      subtext: current.overdue > 0 ? "Cần xử lý ngay" : "Không có tồn đọng",
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
      {cards.map((card) => {
        const Icon = card.icon;
        const rawPositive = (card.delta ?? 0) > 0;
        const rawNegative = (card.delta ?? 0) < 0;
        const good = card.invertDelta ? rawNegative : rawPositive;
        const bad = card.invertDelta ? rawPositive : rawNegative;
        return (
          <div key={card.label} className="rounded-xl border border-border bg-card px-3.5 py-3 shadow-xs">
            <div className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
              <Icon className="size-3.5 shrink-0" />
              <span className="truncate">{card.label}</span>
            </div>
            <div className="mt-1.5 text-2xl font-bold tabular-nums">{card.value}</div>
            <div className="mt-0.5 flex items-center gap-1.5 h-4 text-[11px] font-medium tabular-nums">
              {card.delta !== null && card.delta !== 0 && (
                <span className={cn(good && "text-emerald-600", bad && "text-rose-600")}>
                  {rawPositive ? "▲" : "▼"}{" "}
                  {card.deltaKind === "point"
                    ? formatPercent(Math.abs(card.delta))
                    : formatNumber(Math.abs(card.delta))}
                </span>
              )}
              {card.subtext ? (
                <span className={cn("truncate text-[10px]", card.invertDelta && current.overdue > 0 ? "text-rose-600" : "text-muted-foreground")}>
                  {card.subtext}
                </span>
              ) : (
                card.delta === null && <span className="text-muted-foreground">—</span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
