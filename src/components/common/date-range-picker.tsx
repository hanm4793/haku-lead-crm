"use client";

import * as React from "react";
import { CalendarDays } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
        <Button variant="outline" size="sm" className={cn("gap-2 font-normal", className)}>
          <CalendarDays className="size-3.5" />
          {label}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 space-y-3 p-3">
        <div className="grid grid-cols-2 gap-1.5">
          {DATE_PRESETS.filter((p) => p.id !== "CUSTOM").map((item) => (
            <Button
              key={item.id}
              variant={preset === item.id ? "default" : "outline"}
              size="sm"
              className="justify-start text-[12px]"
              onClick={() => onChange(item.id, resolvePreset(item.id, now))}
            >
              {item.label}
            </Button>
          ))}
        </div>
        <div className="space-y-2 border-t border-border pt-3">
          <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Tùy chỉnh
          </Label>
          <div className="grid grid-cols-2 gap-2">
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Từ ngày</Label>
              <Input
                type="date"
                value={range.from ?? ""}
                onChange={(e) => onChange("CUSTOM", { from: e.target.value || null, to: range.to })}
                className="h-8 text-[12px]"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-[11px] text-muted-foreground">Đến ngày</Label>
              <Input
                type="date"
                value={range.to ?? ""}
                onChange={(e) => onChange("CUSTOM", { from: range.from, to: e.target.value || null })}
                className="h-8 text-[12px]"
              />
            </div>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
