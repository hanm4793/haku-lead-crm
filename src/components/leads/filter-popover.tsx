"use client";

import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { allProducts, DEFAULT_LEAD_CATALOG, type LeadCatalogOptions } from "@/lib/catalog";
import {
  ASSIGNEES,
  CATEGORY_OPTIONS,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
  UNASSIGNED_FILTER_VALUE,
} from "@/lib/constants";
import { countActiveFilters } from "@/lib/filters";
import type { ChannelDetail, FailReason, LeadCategory, LeadFilters, LeadSource } from "@/lib/types";
import { cn } from "@/lib/utils";

const toOptions = (values: readonly string[]) => values.map((v) => ({ value: v, label: v }));

export type FanpageFilterOption = { value: string; label: string };

export function LeadFilterPopover({
  filters,
  onChange,
  onReset,
  fanpageOptions = [],
  assigneeOptions,
  catalog = DEFAULT_LEAD_CATALOG,
}: {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onReset: () => void;
  fanpageOptions?: FanpageFilterOption[];
  assigneeOptions?: string[];
  /** Danh mục brand / sản phẩm / location và nhãn theo project. */
  catalog?: LeadCatalogOptions;
}) {
  const activeCount = countActiveFilters(filters);
  const { labels } = catalog;
  const products = allProducts(catalog);
  const assigneeSelectOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Chưa giao (Chưa phân bổ)" },
    ...toOptions(assigneeOptions ?? ASSIGNEES),
  ];

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 gap-1.5 px-2.5 text-[13px] font-medium",
            activeCount > 0 && "border-primary/40 bg-primary/5 text-primary hover:bg-primary/10",
          )}
        >
          <SlidersHorizontal className="size-3.5" />
          Bộ lọc
          {activeCount > 0 && (
            <span className="ml-0.5 rounded-full bg-primary px-1.5 text-[10px] font-semibold text-primary-foreground">
              {activeCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[560px] p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <div className="text-sm font-semibold">Bộ lọc nâng cao</div>
            <p className="text-[11px] text-muted-foreground">
              Kết hợp nhiều tiêu chí để thu hẹp danh sách lead
            </p>
          </div>
          <Button variant="ghost" size="xs" onClick={onReset} className={cn("text-rose-600 hover:bg-rose-50 hover:text-rose-700", activeCount === 0 && "invisible")}>
            Xóa tất cả
          </Button>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Phân loại KH">
            <MultiSelect
              options={[
                { value: "CHUA_PHAN_LOAI", label: "Chưa phân loại" },
                ...CATEGORY_OPTIONS.map((o) => ({ value: o.value, label: `${o.label} · ${o.hint}` })),
              ]}
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
          <Field label="Người phụ trách">
            <MultiSelect
              options={assigneeSelectOptions}
              selected={filters.assignees}
              onChange={(v) => onChange({ assignees: v })}
            />
          </Field>
          <Field label="Nguồn lead">
            <MultiSelect
              options={SOURCE_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={filters.sources}
              onChange={(v) => onChange({ sources: v as LeadSource[] })}
            />
          </Field>
          <Field label="Chi tiết kênh">
            <MultiSelect
              options={CHANNEL_DETAIL_OPTIONS.map((o) => ({ value: o.value, label: o.label }))}
              selected={filters.channelDetails ?? []}
              onChange={(v) => onChange({ channelDetails: v as ChannelDetail[] })}
              searchable={false}
            />
          </Field>
          <Field label="Fanpage">
            <MultiSelect
              options={fanpageOptions}
              selected={filters.facebookPageIds}
              onChange={(v) => onChange({ facebookPageIds: v })}
              searchable={fanpageOptions.length > 6}
            />
          </Field>
          <Field label={labels.brand}>
            <MultiSelect
              options={catalog.brands.map((b) => ({ value: b.code, label: b.name }))}
              selected={filters.brands}
              onChange={(v) => onChange({ brands: v })}
            />
          </Field>
          <Field label={labels.product}>
            <MultiSelect options={toOptions(products)} selected={filters.products} onChange={(v) => onChange({ products: v })} />
          </Field>
          <Field label={labels.location}>
            <MultiSelect
              options={toOptions(catalog.locations)}
              selected={filters.locations}
              onChange={(v) => onChange({ locations: v })}
            />
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
