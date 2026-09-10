"use client";

import * as React from "react";
import { Check, ChevronDown, Search } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";

export interface MultiSelectOption {
  value: string;
  label: string;
}

export function MultiSelect({
  options,
  selected,
  onChange,
  placeholder = "Tất cả",
  searchable = true,
  className,
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (next: string[]) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
}) {
  const [query, setQuery] = React.useState("");

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q));
  }, [options, query]);

  const toggle = (value: string) => {
    onChange(selected.includes(value) ? selected.filter((v) => v !== value) : [...selected, value]);
  };

  const label =
    selected.length === 0
      ? placeholder
      : selected.length === 1
        ? (options.find((o) => o.value === selected[0])?.label ?? selected[0])
        : `${selected.length} lựa chọn`;

  return (
    <Popover>
      <PopoverTrigger
        className={cn(
          "flex h-9 w-full items-center justify-between gap-2 rounded-md border border-input bg-card px-3 text-sm shadow-xs outline-none transition",
          "hover:bg-accent/40 focus-visible:ring-2 focus-visible:ring-ring/30",
          selected.length === 0 && "text-muted-foreground",
          className,
        )}
      >
        <span className="truncate">{label}</span>
        <ChevronDown className="size-4 shrink-0 opacity-60" />
      </PopoverTrigger>
      <PopoverContent className="w-64 p-2">
        {searchable && (
          <div className="relative mb-2">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Tìm..."
              className="h-8 pl-8 text-[13px]"
            />
          </div>
        )}
        <div className="thin-scrollbar max-h-56 overflow-y-auto">
          {filtered.length === 0 && <div className="px-2 py-3 text-center text-xs text-muted-foreground">Không có kết quả</div>}
          {filtered.map((option) => {
            const active = selected.includes(option.value);
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => toggle(option.value)}
                className={cn(
                  "flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors hover:bg-accent",
                  active && "font-medium text-primary",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 shrink-0 items-center justify-center rounded-[4px] border",
                    active ? "border-primary bg-primary text-primary-foreground" : "border-input",
                  )}
                >
                  {active && <Check className="size-3" />}
                </span>
                <span className="truncate">{option.label}</span>
              </button>
            );
          })}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-2 w-full rounded-md border border-border py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent"
          >
            Bỏ chọn tất cả
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
}
