"use client";

import * as React from "react";
import { Search } from "lucide-react";

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
    <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
      {tabs}
      {search && (
        <div className="relative w-56">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search.value}
            onChange={(e) => search.onChange(e.target.value)}
            placeholder={search.placeholder}
            className="h-8 pl-8 text-[13px]"
          />
        </div>
      )}
      {filters}
      {actions && <div className="ml-auto flex items-center gap-2">{actions}</div>}
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
      <TabsList className="gap-0">
        {tabs.map((tab) => (
          <TabsTrigger
            key={tab.id}
            value={tab.id}
            className="border-b-0 data-[state=active]:rounded-md data-[state=active]:bg-accent"
          >
            {tab.label}
            {tab.count !== undefined && (
              <span
                className={cn(
                  "rounded px-1 text-[11px] tabular-nums",
                  value === tab.id ? "bg-primary/10 text-primary" : "text-muted-foreground",
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
      <SelectTrigger className={cn("h-8 w-40 text-[13px]", className)}>
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
