"use client";

import * as React from "react";
import { Search, X } from "lucide-react";

import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";

/** Thanh công cụ trên đầu bảng: tab (tuỳ chọn) · tìm kiếm · bộ lọc · nút hành động bên phải. */
export function ListToolbar({
  tabs,
  search,
  filters,
  actions,
}: {
  tabs?: React.ReactNode;
  search?: { value: string; onChange: (value: string) => void; placeholder: string };
  filters?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 border-b border-border px-3 py-2.5 sm:px-3.5">
      {tabs && <div className="min-w-0 max-sm:w-full">{tabs}</div>}
      {search && (
        <div className="relative w-full min-w-0 sm:w-60 sm:flex-none">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="h-9 pl-8 pr-7 text-[13px] sm:h-8"
          />
          {search.value && (
            <button
              type="button"
              onClick={() => search.onChange("")}
              aria-label="Xóa tìm kiếm"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          )}
        </div>
      )}
      {filters}
      {actions && <div className="ml-auto flex shrink-0 items-center gap-2">{actions}</div>}
    </div>
  );
}

/** Tab có đếm số, cùng kiểu với tab trạng thái ở màn Lead. */
export function CountTabs<T extends string>({
  value,
  onChange,
  tabs,
}: {
  value: T;
  onChange: (value: T) => void;
  tabs: { id: T; label: string; count?: number }[];
}) {
  return (
    <Tabs value={value} onValueChange={(v) => onChange(v as T)}>
      <TabsList className="flex h-auto w-full flex-wrap justify-start gap-1 rounded-lg bg-slate-100/90 p-1 sm:inline-flex sm:w-auto">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="flex-1 rounded-md border-b-0 px-2.5 py-1.5 text-xs data-[state=active]:bg-white data-[state=active]:shadow-2xs sm:flex-none sm:text-[13px]"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded px-1.5 text-[11px] font-semibold tabular-nums",
                  value === tab.id ? "bg-primary/12 text-primary" : "text-muted-foreground",
                )}
              >
                {tab.count}
              </span>
            )}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}

export interface FilterOption {
  value: string;
  label: string;
}

/** Ô lọc dạng danh sách chọn, cao bằng ô tìm kiếm. */
export function FilterSelect({
  value,
  onChange,
  options,
  className,
}: {
  value: string;
  onChange: (value: string) => void;
  options: FilterOption[];
  className?: string;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" className={cn("h-9 min-w-[120px] flex-1 text-[13px] sm:h-8 sm:w-40 sm:flex-none", className)}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export const STATUS_FILTER_OPTIONS: FilterOption[] = [
  { value: "all", label: "Mọi trạng thái" },
  { value: "active", label: "Đang bật" },
  { value: "inactive", label: "Đang tắt" },
];

export function matchesStatus(filter: string, active: boolean): boolean {
  return filter === "all" || (filter === "active" ? active : !active);
}

/** Công tắc bật/tắt kèm nhãn trạng thái, dùng chung cho mọi bảng. */
export function ActiveSwitch({
  checked,
  disabled,
  onChange,
}: {
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <span className="inline-flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
      <Switch checked={checked} disabled={disabled} onCheckedChange={onChange} />
      <span className={cn("text-[12px] font-medium", checked ? "text-emerald-700" : "text-muted-foreground")}>
        {checked ? "Đang bật" : "Đang tắt"}
      </span>
    </span>
  );
}
