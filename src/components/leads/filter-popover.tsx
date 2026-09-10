"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  ALL_CAR_MODELS,
  ASSIGNEES,
  BRAND_OPTIONS,
  CATEGORY_OPTIONS,
  FAIL_REASON_OPTIONS,
  SALES_ROOMS,
  SHOWROOMS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import { countActiveFilters } from "@/lib/filters";
import type { Brand, FailReason, LeadCategory, LeadFilters, LeadSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export function LeadFilterPopover({
  filters,
  onChange,
  onReset,
}: {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onReset: () => void;
}) {
  const activeCount = countActiveFilters(filters);

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <SlidersHorizontal className="size-3.5" />
          Bộ lọc
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[560px] p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">Bộ lọc nâng cao</div>
          <Button variant="ghost" size="xs" onClick={onReset} className={cn(activeCount === 0 && "invisible")}>
            Xóa tất cả
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Nguồn">
            <MultiSelect
              options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={filters.sources}
              onChange={(v) => onChange({ sources: v as LeadSource[] })}
            />
          </Field>
          <Field label="Thương hiệu">
            <MultiSelect
              options={BRAND_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={filters.brands}
              onChange={(v) => onChange({ brands: v as Brand[] })}
            />
          </Field>
          <Field label="Showroom">
            <MultiSelect options={toOptions(SHOWROOMS)} selected={filters.showrooms} onChange={(v) => onChange({ showrooms: v })} />
          </Field>
          <Field label="Phòng bán hàng">
            <MultiSelect options={toOptions(SALES_ROOMS)} selected={filters.salesRooms} onChange={(v) => onChange({ salesRooms: v })} />
          </Field>
          <Field label="Phụ trách">
            <MultiSelect options={toOptions(ASSIGNEES)} selected={filters.assignees} onChange={(v) => onChange({ assignees: v })} />
          </Field>
          <Field label="Dòng xe">
            <MultiSelect options={toOptions(ALL_CAR_MODELS)} selected={filters.carModels} onChange={(v) => onChange({ carModels: v })} />
          </Field>
          <Field label="Phân loại">
            <MultiSelect
              options={CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} · ${o.hint}` }))}
              selected={filters.categories}
              onChange={(v) => onChange({ categories: v as LeadCategory[] })}
              searchable={false}
            />
          </Field>
          <Field label="Lý do loại">
            <MultiSelect
              options={FAIL_REASON_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={filters.failReasons}
              onChange={(v) => onChange({ failReasons: v as FailReason[] })}
              searchable={false}
            />
          </Field>
          <Field label="Đối soát B10">
            <Select value={filters.b10} onValueChange={(v) => onChange({ b10: v as LeadFilters["b10"] })}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Tất cả</SelectItem>
                <SelectItem value="PUSHED">Đã lên B10</SelectItem>
                <SelectItem value="NOT_PUSHED">Chưa lên B10</SelectItem>
              </SelectContent>
            </Select>
          </Field>
        </div>
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
