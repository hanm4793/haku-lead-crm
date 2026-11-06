"use client";

import * as React from "react";
import { format, parseISO } from "date-fns";
import { vi } from "date-fns/locale";
import { CalendarDays } from "lucide-react";
import type { DateRange as DayPickerRange } from "react-day-picker";

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useNow } from "@/components/providers/now-provider";
import { useIsMobile } from "@/hooks/use-media-query";
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
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);

  const label =
    preset === "CUSTOM" && (range.from || range.to)
      ? `${range.from ? formatDate(range.from) : "…"} → ${range.to ? formatDate(range.to) : "…"}`
      : (DATE_PRESETS.find((p) => p.id === preset)?.label ?? "Tất cả thời gian");

  const isFiltered = preset !== "ALL" || Boolean(range.from || range.to);

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "h-8 gap-1.5 px-2.5 text-[13px] font-medium max-md:h-9 max-md:rounded-lg",
        isFiltered && "border-primary/40 bg-primary/8 text-primary hover:bg-primary/12",
        className,
      )}
    >
      <CalendarDays className={cn("size-3.5 shrink-0", isFiltered ? "text-primary" : "text-muted-foreground")} />
      <span className="max-w-[170px] truncate sm:max-w-[200px]">{label}</span>
    </Button>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0">
            <div className="shrink-0 border-b border-border px-4 py-3 pr-12">
              <DialogTitle className="text-base font-bold">Khoảng thời gian</DialogTitle>
              <DialogDescription className="text-xs">
                Chọn nhanh mốc thời gian hoặc chọn ngày tùy chỉnh trên lịch
              </DialogDescription>
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain p-4">
              <div className="flex flex-wrap gap-1.5">
                {DATE_PRESETS.filter((p) => p.id !== "CUSTOM").map((item) => {
                  const active = preset === item.id;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => {
                        onChange(item.id, resolvePreset(item.id, now));
                        setOpen(false);
                      }}
                      className={cn(
                        "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors active:scale-96",
                        active
                          ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                          : "border-border bg-slate-50 text-slate-700 hover:bg-accent",
                      )}
                    >
                      {item.label}
                    </button>
                  );
                })}
              </div>

              <div className="flex flex-col items-center rounded-xl border border-border bg-slate-50/50 p-2.5">
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
                  <p className="mt-1 text-xs font-medium tabular-nums text-primary">
                    {range.from ? format(parseISO(range.from), "d MMM yyyy", { locale: vi }) : "…"} →{" "}
                    {range.to ? format(parseISO(range.to), "d MMM yyyy", { locale: vi }) : "…"}
                  </p>
                )}
              </div>
            </div>

            <div className="shrink-0 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              <Button type="button" className="w-full" onClick={() => setOpen(false)}>
                Áp dụng
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{triggerButton}</PopoverTrigger>
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
                onClick={() => {
                  onChange(item.id, resolvePreset(item.id, now));
                  setOpen(false);
                }}
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
              <p className="mt-2 text-[12px] tabular-nums text-muted-foreground">
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
