"use client";

import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { CATEGORY_COLOR } from "@/lib/constants";
import type { CategoryShare, DailyPoint, FunnelStep, ModelBar, SourceBar } from "@/lib/metrics";
import { cn, formatNumber, formatPercent } from "@/lib/utils";

const AXIS_STYLE = { fontSize: 11, fill: "#94a3b8" } as const;
const GRID_COLOR = "#e2e8f0";

const tooltipStyle = {
  borderRadius: 8,
  border: `1px solid ${GRID_COLOR}`,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,28,51,.10)",
};

export function DailyLeadChart({ data }: { data: DailyPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={230}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12479e" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#12479e" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} minTickGap={24} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip contentStyle={tooltipStyle} formatter={(v) => [formatNumber(Number(v)), "Lead"]} />
        <Area type="monotone" dataKey="leads" stroke="#12479e" strokeWidth={2} fill="url(#leadGradient)" />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const FUNNEL_COLORS = ["#e8542f", "#f0803c", "#f5b942", "#2fb08a", "#1f8fd6"];

export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-1.5">
      {steps.map((step, index) => {
        const width = Math.max(12, (step.value / max) * 100);
        const nextWidth =
          index < steps.length - 1 ? Math.max(12, (steps[index + 1].value / max) * 100) : width * 0.9;

        return (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex w-44 shrink-0 items-center gap-2 text-[12px] text-slate-600">
              <span className="flex size-4 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                {index + 1}
              </span>
              <span className="truncate">{step.label}</span>
            </div>

            <div className="relative h-11 flex-1">
              <svg viewBox="0 0 100 40" preserveAspectRatio="none" className="h-full w-full">
                <polygon
                  points={`${(100 - width) / 2},0 ${(100 + width) / 2},0 ${(100 + nextWidth) / 2},40 ${(100 - nextWidth) / 2},40`}
                  fill={FUNNEL_COLORS[index % FUNNEL_COLORS.length]}
                />
              </svg>
              <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center leading-none text-white">
                <span className="text-sm font-bold tabular-nums">{formatNumber(step.value)}</span>
                <span className="text-[10px] opacity-90">{formatPercent(step.shareOfTotal)}</span>
              </div>
            </div>

            <div className="w-14 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-500">
              {index === 0 ? "—" : formatPercent(step.stepConversion)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategoryShare[] }) {
  return (
    <ResponsiveContainer width="100%" height={250}>
      <PieChart>
        <Pie data={data} dataKey="value" nameKey="label" innerRadius={58} outerRadius={90} paddingAngle={2} strokeWidth={0}>
          {data.map((entry) => (
            <Cell key={entry.category} fill={CATEGORY_COLOR[entry.category]} />
          ))}
        </Pie>
        <Tooltip contentStyle={tooltipStyle} formatter={(v, n) => [formatNumber(Number(v)), String(n)]} />
        <Legend
          layout="vertical"
          align="right"
          verticalAlign="middle"
          iconType="circle"
          iconSize={8}
          formatter={(value) => <span className="text-[11px] text-slate-600">{value}</span>}
        />
      </PieChart>
    </ResponsiveContainer>
  );
}

export function SourceComparisonChart({ data }: { data: SourceBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 54)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={3}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} allowDecimals={false} />
        <YAxis type="category" dataKey="source" tick={AXIS_STYLE} tickLine={false} axisLine={false} width={72} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Legend iconType="square" iconSize={9} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
        <Bar dataKey="leads" name="Lead" fill="#12479e" radius={[0, 3, 3, 0]} barSize={12} />
        <Bar dataKey="khqt" name="KHQT" fill="#0f9d8f" radius={[0, 3, 3, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CarModelChart({ data }: { data: ModelBar[] }) {
  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={3}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} allowDecimals={false} />
        <YAxis type="category" dataKey="model" tick={AXIS_STYLE} tickLine={false} axisLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Legend iconType="square" iconSize={9} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
        <Bar dataKey="leads" name="Lead" fill="#12479e" radius={[0, 3, 3, 0]} barSize={10} />
        <Bar dataKey="khqt" name="KHQT" fill="#0f9d8f" radius={[0, 3, 3, 0]} barSize={10} />
      </BarChart>
    </ResponsiveContainer>
  );
}

/** Thanh ngang xếp hạng lý do mất khách — kiểu bảng, không dùng recharts. */
export function LossReasonBars({ data }: { data: { reason: string; count: number; share: number }[] }) {
  const max = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-3">
      {data.length === 0 && <p className="py-6 text-center text-sm text-muted-foreground">Không có khách bị loại trong kỳ.</p>}
      {data.map((row) => (
        <div key={row.reason}>
          <div className="flex items-baseline justify-between gap-3 text-[13px]">
            <span className="truncate text-slate-700">{row.reason}</span>
            <span className="shrink-0 tabular-nums text-slate-500">
              <span className="font-semibold text-slate-800">{formatNumber(row.count)}</span> · {formatPercent(row.share)}
            </span>
          </div>
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-rose-50">
            <div
              className={cn("h-full rounded-full bg-rose-500")}
              style={{ width: `${Math.max(2, (row.count / max) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
