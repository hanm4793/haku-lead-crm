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
import type { CategoryShare, DailyPoint, FailReasonBar, FunnelStep, ModelBar, SourceBar } from "@/lib/metrics";
import { formatNumber, formatPercent, ratio } from "@/lib/utils";

const AXIS_STYLE = { fontSize: 11, fill: "#94a3b8" } as const;
const GRID_COLOR = "#e2e8f0";

const tooltipStyle = {
  borderRadius: 8,
  border: `1px solid ${GRID_COLOR}`,
  fontSize: 12,
  boxShadow: "0 8px 24px rgba(15,28,51,.10)",
};

function EmptyChart({ message = "Chưa có dữ liệu trong kỳ lọc này." }: { message?: string }) {
  return (
    <div className="flex h-[220px] items-center justify-center rounded-lg border border-dashed border-border/70 bg-slate-50/50 text-xs text-muted-foreground">
      {message}
    </div>
  );
}

export function DailyLeadChart({ data }: { data: DailyPoint[] }) {
  if (data.length === 0 || data.every((d) => d.leads === 0 && d.khqt === 0)) {
    return <EmptyChart />;
  }

  return (
    <ResponsiveContainer width="100%" height={240}>
      <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
        <defs>
          <linearGradient id="leadGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#12479e" stopOpacity={0.28} />
            <stop offset="100%" stopColor="#12479e" stopOpacity={0.02} />
          </linearGradient>
          <linearGradient id="khqtGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#0f9d8f" stopOpacity={0.26} />
            <stop offset="100%" stopColor="#0f9d8f" stopOpacity={0.02} />
          </linearGradient>
        </defs>
        <XAxis dataKey="label" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} minTickGap={24} />
        <YAxis tick={AXIS_STYLE} tickLine={false} axisLine={false} allowDecimals={false} width={40} />
        <Tooltip
          contentStyle={tooltipStyle}
          formatter={(v, name) => [
            formatNumber(Number(v)),
            name === "khqt" || name === "KHQT+" ? "KHQT+" : "Tổng lead",
          ]}
        />
        <Legend
          iconType="circle"
          iconSize={8}
          formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>}
        />
        <Area
          type="monotone"
          dataKey="leads"
          name="Tổng lead"
          stroke="#12479e"
          strokeWidth={2}
          fill="url(#leadGradient)"
        />
        <Area
          type="monotone"
          dataKey="khqt"
          name="KHQT+"
          stroke="#0f9d8f"
          strokeWidth={2}
          fill="url(#khqtGradient)"
        />
      </AreaChart>
    </ResponsiveContainer>
  );
}

const FUNNEL_COLORS = ["#12479e", "#2563eb", "#0f9d8f", "#d97706", "#059669"];

export function ConversionFunnel({ steps }: { steps: FunnelStep[] }) {
  const max = Math.max(...steps.map((s) => s.value), 1);

  return (
    <div className="space-y-1.5">
      <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-wide text-slate-400">
        <div className="w-48 shrink-0">Bậc chuyển đổi</div>
        <div className="flex-1 text-center">Số lượng · % tổng lead</div>
        <div className="w-16 shrink-0 text-right">Vs bậc trước</div>
      </div>
      {steps.map((step, index) => {
        const width = Math.max(14, (step.value / max) * 100);
        const nextWidth =
          index < steps.length - 1 ? Math.max(14, (steps[index + 1].value / max) * 100) : width * 0.9;

        return (
          <div key={step.label} className="flex items-center gap-3">
            <div className="flex w-48 shrink-0 items-center gap-2 text-[12px] text-slate-600">
              <span className="flex size-4 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-500">
                {index + 1}
              </span>
              <span className="truncate" title={step.label}>
                {step.label}
              </span>
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

            <div className="w-16 shrink-0 text-right text-[12px] font-medium tabular-nums text-slate-500">
              {index === 0 ? "—" : formatPercent(step.stepConversion)}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function CategoryDonut({ data }: { data: CategoryShare[] }) {
  if (data.length === 0) {
    return <EmptyChart />;
  }

  const total = data.reduce((sum, item) => sum + item.value, 0);

  return (
    <div className="grid items-center gap-4 sm:grid-cols-[190px_1fr]">
      <div className="relative mx-auto h-[190px] w-[190px]">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={data}
              dataKey="value"
              nameKey="label"
              innerRadius={56}
              outerRadius={84}
              paddingAngle={2}
              strokeWidth={0}
            >
              {data.map((entry) => (
                <Cell key={entry.category} fill={CATEGORY_COLOR[entry.category]} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={tooltipStyle}
              formatter={(v, n) => [
                `${formatNumber(Number(v))} (${formatPercent(ratio(Number(v), total))})`,
                String(n),
              ]}
            />
          </PieChart>
        </ResponsiveContainer>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Tổng</span>
          <span className="text-lg font-bold tabular-nums text-slate-800">{formatNumber(total)}</span>
        </div>
      </div>

      <div className="space-y-2">
        {data.map((entry) => {
          const pct = ratio(entry.value, total);
          return (
            <div key={entry.category} className="flex items-center justify-between gap-2 text-[12px]">
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: CATEGORY_COLOR[entry.category] }}
                />
                <span className="truncate text-slate-700">{entry.label}</span>
              </div>
              <div className="shrink-0 tabular-nums text-slate-600">
                <span className="font-semibold text-slate-800">{formatNumber(entry.value)}</span>{" "}
                <span className="text-[11px] text-slate-400">({formatPercent(pct)})</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FailReasonChart({ data }: { data: FailReasonBar[] }) {
  if (data.length === 0) {
    return <EmptyChart message="Chưa có lead bị đánh dấu Loại (Fail) trong kỳ này." />;
  }

  const maxCount = Math.max(...data.map((d) => d.count), 1);

  return (
    <div className="space-y-2.5">
      {data.map((item) => (
        <div key={item.reason} className="space-y-1">
          <div className="flex items-center justify-between gap-2 text-[12px]">
            <span className="truncate font-medium text-slate-700" title={item.label}>
              {item.label}
            </span>
            <span className="shrink-0 tabular-nums text-slate-600">
              <strong className="font-semibold text-rose-600">{formatNumber(item.count)}</strong>{" "}
              <span className="text-[11px] text-slate-400">({formatPercent(item.share)})</span>
            </span>
          </div>
          <div className="h-2 w-full overflow-hidden rounded-full bg-rose-50">
            <div
              className="h-full rounded-full bg-rose-500 transition-all"
              style={{ width: `${Math.max(4, (item.count / maxCount) * 100)}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}

export function SourceComparisonChart({ data }: { data: SourceBar[] }) {
  if (data.length === 0) {
    return <EmptyChart />;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(180, data.length * 54)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={3}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} allowDecimals={false} />
        <YAxis type="category" dataKey="source" tick={AXIS_STYLE} tickLine={false} axisLine={false} width={72} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Legend iconType="square" iconSize={9} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
        <Bar dataKey="leads" name="Lead" fill="#12479e" radius={[0, 3, 3, 0]} barSize={12} />
        <Bar dataKey="khqt" name="KHQT+" fill="#0f9d8f" radius={[0, 3, 3, 0]} barSize={12} />
      </BarChart>
    </ResponsiveContainer>
  );
}

export function CarModelChart({ data }: { data: ModelBar[] }) {
  if (data.length === 0) {
    return <EmptyChart />;
  }

  return (
    <ResponsiveContainer width="100%" height={Math.max(220, data.length * 42)}>
      <BarChart data={data} layout="vertical" margin={{ top: 4, right: 16, bottom: 0, left: 8 }} barGap={3}>
        <XAxis type="number" tick={AXIS_STYLE} tickLine={false} axisLine={{ stroke: GRID_COLOR }} allowDecimals={false} />
        <YAxis type="category" dataKey="model" tick={AXIS_STYLE} tickLine={false} axisLine={false} width={110} />
        <Tooltip contentStyle={tooltipStyle} cursor={{ fill: "#f1f5f9" }} />
        <Legend iconType="square" iconSize={9} formatter={(v) => <span className="text-[11px] text-slate-600">{v}</span>} />
        <Bar dataKey="leads" name="Lead" fill="#12479e" radius={[0, 3, 3, 0]} barSize={10} />
        <Bar dataKey="khqt" name="KHQT+" fill="#0f9d8f" radius={[0, 3, 3, 0]} barSize={10} />
      </BarChart>
    </ResponsiveContainer>
  );
}
