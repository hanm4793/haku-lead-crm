"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger, usePopoverControls } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

function MultiSelectBody({
  options,
  selected,
  onChange,
  placeholder,
  searchable,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
  searchable: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const popover = usePopoverControls();

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  return (
    <div className="flex w-full flex-col">
      {popover?.isMobile && (
        <div className="mb-2 flex items-center justify-between px-0.5">
          <span className="text-[12px] font-semibold uppercase tracking-wider text-muted-foreground">
            {placeholder} {selected.length > 0 ? `(${selected.length})` : ""}
          </span>
          {selected.length > 0 && (
            <button
              type="button"
              onClick={() => onChange([])}
              className="text-xs font-medium text-primary hover:underline"
            >
              Bỏ chọn hết
            </button>
          )}
        </div>
      )}

      {searchable && (
        <div className="relative mb-2">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground md:size-3.5" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Tìm nhanh..."
            className="h-9 pl-8 text-base md:h-8 md:text-[13px]"
          />
        </div>
      )}

      <div className="thin-scrollbar max-h-[52dvh] overflow-y-auto overscroll-contain md:max-h-56">
        {filtered.length === 0 && (
          <div className="px-2 py-4 text-center text-xs text-muted-foreground">Không có kết quả</div>
        )}
        {filtered.map((option) => {
          const active = selected.includes(option.value);
          return (
            <button
              key={option.value}
              type="button"
              onClick={() => toggle(option.value)}
              className={cn(
                "flex min-h-[44px] w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-[14px] transition-colors hover:bg-accent active:bg-accent md:min-h-0 md:rounded-md md:px-2 md:py-1.5 md:text-[13px]",
                active && "bg-primary/8 font-medium text-primary md:bg-transparent",
              )}
            >
              <span
                className={cn(
                  "flex size-4.5 shrink-0 items-center justify-center rounded-[5px] border md:size-4 md:rounded-[4px]",
                  active ? "border-primary bg-primary text-primary-foreground" : "border-input bg-card",
                )}
              >
                {active && <Check className="size-3.5 md:size-3" />}
              </span>
              <span className="min-w-0 flex-1 break-words md:truncate">{option.label}</span>
            </button>
          );
        })}
      </div>

      {popover?.isMobile ? (
        <div className="mt-2.5 border-t border-border/70 pt-2.5">
          <button
            type="button"
            onClick={() => popover.close()}
            className="flex h-10 w-full items-center justify-center rounded-xl bg-primary text-sm font-semibold text-primary-foreground shadow-xs active:scale-[0.99]"
          >
            Xong {selected.length > 0 ? `(${selected.length})` : ""}
          </button>
        </div>
      ) : (
        selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            Bỏ chọn tất cả
          </button>
        )
      )}
    </div>
  );
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Tất cả",
  searchable = true,
  disabled = false,
  displayMode = "count",
  className,
  contentClassName,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
  displayMode?: "count" | "labels";
  className?: string;
  contentClassName?: string;
}) {
  const label =
    selected.length === 0
      ? placeholder
      : displayMode === "labels"
        ? selected.map((val) => options.find((o) => o.value === val)?.label ?? val).join(", ")
        : selected.length === 1
          ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
          : `${selected.length} lựa chọn`;

  return (
    <Popover>
      <PopoverTrigger
        type="button"
        disabled={disabled}
        className={cn(
          "flex h-9 max-md:h-10 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-xs touch-manipulation outline-none transition",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50",
          selected.length === 0 && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate text-left">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className={cn("w-[var(--radix-popover-trigger-width)] min-w-56 p-2 max-md:p-3.5 max-md:pt-1", contentClassName)}>
        <MultiSelectBody
          options={options}
          selected={selected}
          onChange={onChange}
          placeholder={placeholder}
          searchable={searchable}
        />
      </PopoverContent>
    </Popover>
  );
}
