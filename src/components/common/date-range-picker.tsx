"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/components/providers/now-provider";
import {
  DATE_PRESETS,
  resolvePreset,
  type DateRange,
  type PresetId,
} from "@/lib/date-range";
import { cn, formatDate } from "@/lib/utils";

export type { DateRange, PresetId };
export { DATE_PRESETS, resolvePreset };

function toDayPickerRange(range: DateRange): DayPickerRange | undefined {
  if (!range.from && !range.to) return undefined;
  return {
    from: range.from ? parseISO(range.from) : undefined,
    to: range.to ? parseISO(range.to) : undefined,
  };
}

export function DateRangePicker({
  preset,
  range,
  onChange,
  className,
}: {
  preset: PresetId;
  range: DateRange;
  onChange: (preset: PresetId, range: DateRange) => void;
  className?: string;
}) {
  const now = useNow();
  const label =
    preset === "CUSTOM" && (range.from || range.to)
      ? `${range.from ? formatDate(range.from) : "…"} → ${range.to ? formatDate(range.to) : "…"}`
      : (DATE_PRESETS.find((p) => p.id === preset)?.label ?? "Tất cả thời gian");

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 gap-2 rounded-lg border-input bg-card px-3 font-medium shadow-xs", className)}
        >
          <CalendarDays className="size-3.5 text-primary" />
          <span className="max-w-[220px] truncate">{label}</span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto overflow-hidden rounded-xl border-border p-0 shadow-lg">
        <div className="grid gap-0 sm:grid-cols-[9.5rem_1fr]">
          <div className="flex flex-col gap-1 border-b border-border bg-muted/40 p-2.5 sm:border-b-0 sm:border-r">
            {DATE_PRESETS.filter((p) => p.id !== "CUSTOM").map((item) => (
              <Button
                key={item.id}
                variant={preset === item.id ? "default" : "ghost"}
                size="sm"
                className={cn(
                  "h-8 justify-start rounded-md px-2.5 text-[12px] font-medium",
                  preset !== item.id && "text-muted-foreground",
                )}
                onClick={() => onChange(item.id, resolvePreset(item.id, now))}
              >
                {item.label}
              </Button>
            ))}
          </div>
          <div className="p-3">
            <p className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              Tùy chỉnh khoảng ngày
            </p>
            <Calendar
              mode="range"
              numberOfMonths={1}
              selected={toDayPickerRange(range)}
              defaultMonth={range.from ? parseISO(range.from) : now}
              onSelect={(next) => {
                onChange("CUSTOM", {
                  from: next?.from ? format(next.from, "yyyy-MM-dd") : null,
                  to: next?.to ? format(next.to, "yyyy-MM-dd") : null,
                });
              }}
            />
            {(range.from || range.to) && (
              <p className="mt-2 text-[12px] text-muted-foreground">
                {range.from
                  ? format(parseISO(range.from), "d MMM yyyy", { locale: vi })
                  : "…"}{" "}
                →{" "}
                {range.to ? format(parseISO(range.to), "d MMM yyyy", { locale: vi }) : "…"}
              </p>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
