"use client";

import * as React from "react";
import { SlidersHorizontal } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { MultiSelect } from "@/components/ui/multi-select";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useIsMobile } from "@/hooks/use-media-query";
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
  compactTrigger = false,
}: {
  filters: LeadFilters;
  onChange: (patch: Partial<LeadFilters>) => void;
  onReset: () => void;
  fanpageOptions?: FanpageFilterOption[];
  assigneeOptions?: string[];
  /** Danh mục brand / sản phẩm / location và nhãn theo project. */
  catalog?: LeadCatalogOptions;
  /** Thu gọn nhãn nút trên thanh công cụ mobile. */
  compactTrigger?: boolean;
}) {
  const isMobile = useIsMobile();
  const [open, setOpen] = React.useState(false);
  const activeCount = countActiveFilters(filters);
  const { labels } = catalog;
  const products = allProducts(catalog);
  const assigneeSelectOptions = [
    { value: UNASSIGNED_FILTER_VALUE, label: "Chưa giao (Chưa phân bổ)" },
    ...toOptions(assigneeOptions ?? ASSIGNEES),
  ];

  const triggerButton = (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={isMobile ? () => setOpen(true) : undefined}
      className={cn(
        "h-8 gap-1.5 px-2.5 text-[13px] font-medium max-md:h-9 max-md:rounded-lg",
        activeCount > 0 && "border-primary/40 bg-primary/8 text-primary hover:bg-primary/12",
      )}
    >
      <SlidersHorizontal className="size-3.5" />
      <span className={cn(compactTrigger && "max-sm:sr-only")}>Bộ lọc</span>
      {activeCount > 0 && (
        <span className="rounded-full bg-primary px-1.5 text-[10px] font-semibold tabular-nums text-primary-foreground">
          {activeCount}
        </span>
      )}
    </Button>
  );

  const fieldsGrid = (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
        <MultiSelect
          options={toOptions(products)}
          selected={filters.products}
          onChange={(v) => onChange({ products: v })}
        />
      </Field>
      <Field label={labels.location}>
        <MultiSelect
          options={toOptions(catalog.locations)}
          selected={filters.locations}
          onChange={(v) => onChange({ locations: v })}
        />
      </Field>
    </div>
  );

  if (isMobile) {
    return (
      <>
        {triggerButton}
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="flex max-h-[88dvh] flex-col gap-0 overflow-hidden p-0">
            <div className="flex shrink-0 items-center justify-between border-b border-border px-4 py-3 pr-12">
              <div>
                <DialogTitle className="text-base font-bold">Bộ lọc nâng cao</DialogTitle>
                <DialogDescription className="text-xs">
                  Kết hợp nhiều tiêu chí để thu hẹp danh sách lead
                </DialogDescription>
              </div>
              {activeCount > 0 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  onClick={onReset}
                  className="text-rose-600 hover:bg-rose-50 hover:text-rose-700"
                >
                  Xóa ({activeCount})
                </Button>
              )}
            </div>

            <div className="thin-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain p-4">
              {fieldsGrid}
            </div>

            <div className="flex shrink-0 items-center gap-2 border-t border-border bg-card px-4 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom,0px))]">
              {activeCount > 0 && (
                <Button type="button" variant="outline" className="flex-1" onClick={onReset}>
                  Đặt lại
                </Button>
              )}
              <Button type="button" className="flex-1" onClick={() => setOpen(false)}>
                Xem kết quả{activeCount > 0 ? ` (${activeCount} lọc)` : ""}
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
      <PopoverContent align="start" className="w-[min(560px,calc(100vw-2rem))] p-4">
        <div className="mb-3 flex items-center justify-between border-b border-border pb-2.5">
          <div>
            <div className="text-sm font-semibold">Bộ lọc nâng cao</div>
            <p className="text-[11px] text-muted-foreground">
              Kết hợp nhiều tiêu chí để thu hẹp danh sách lead
            </p>
          </div>
          <Button
            variant="ghost"
            size="xs"
            onClick={onReset}
            className={cn(
              "text-rose-600 hover:bg-rose-50 hover:text-rose-700",
              activeCount === 0 && "invisible",
            )}
          >
            Xóa tất cả
          </Button>
        </div>

        {fieldsGrid}
      </PopoverContent>
    </Popover>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      {children}
    </div>
  );
}
