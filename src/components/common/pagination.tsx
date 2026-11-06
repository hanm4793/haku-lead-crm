"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { cn, formatNumber } from "@/lib/utils";

const DEFAULT_PAGE_SIZES = [10, 25, 50, 100, 200];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
  unit = "khách",
  pageSizes = DEFAULT_PAGE_SIZES,
}: {
  page: number;
  pageSize: number;
  total: number;
  unit?: string;
  pageSizes?: number[];
  onPageChange: (page: number) => void;
  onPageSizeChange?: (size: number) => void;
}) {
  const safePageSize = Math.max(1, pageSize);
  const pageCount = Math.max(1, Math.ceil(total / safePageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);
  const first = total === 0 ? 0 : (safePage - 1) * safePageSize + 1;
  const last = total === 0 ? 0 : Math.min(safePage * safePageSize, total);

  const pages = buildPageList(safePage, pageCount);

  return (
    <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border bg-card px-3.5 py-2.5 text-[13px] sm:px-4">
      <div className="flex min-w-0 items-center gap-2">
        <span className="truncate tabular-nums text-xs text-muted-foreground sm:text-[13px]">
          <span className="hidden sm:inline">Hiển thị </span>
          {formatNumber(first)}–{formatNumber(last)} / {formatNumber(total)}{" "}
          <span className="hidden xs:inline">{unit}</span>
        </span>
        {onPageSizeChange && pageSizes.length > 1 && (
          <div className="hidden sm:block">
            <Select
              value={String(safePageSize)}
              onValueChange={(v) => {
                const nextSize = Number(v);
                onPageSizeChange(nextSize);
                onPageChange(1);
              }}
            >
              <SelectTrigger
                size="sm"
                aria-label="Số dòng mỗi trang"
                className="h-7 max-md:h-8 w-auto gap-1.5 px-2.5 text-xs tabular-nums"
              >
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {pageSizes.map((size) => (
                  <SelectItem key={size} value={String(size)}>
                    {size}/trang
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </div>

      {/* Mobile: Cụm nút Trước / Trang hiện tại / Sau kích thước chuẩn cảm ứng */}
      <div className="flex shrink-0 items-center gap-1.5 sm:hidden">
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Trang trước"
          className="size-8.5 rounded-lg"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft className="size-4" />
        </Button>
        <span className="min-w-12 text-center text-xs font-semibold tabular-nums text-slate-700">
          {safePage} / {pageCount}
        </span>
        <Button
          type="button"
          variant="outline"
          size="icon"
          aria-label="Trang tiếp"
          className="size-8.5 rounded-lg"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        >
          <ChevronRight className="size-4" />
        </Button>
      </div>

      {/* Desktop & Tablet: Đầy đủ danh sách trang */}
      <div className="hidden items-center gap-1 sm:flex">
        <Button
          type="button"
          variant="outline"
          size="iconSm"
          aria-label="Trang trước"
          disabled={safePage <= 1}
          onClick={() => onPageChange(Math.max(1, safePage - 1))}
        >
          <ChevronLeft className="size-3.5" />
        </Button>
        {pages.map((p, i) =>
          p === "..." ? (
            <span key={`gap-${i}`} className="px-1 text-muted-foreground">
              …
            </span>
          ) : (
            <button
              key={p}
              type="button"
              onClick={() => {
                if (p !== safePage) onPageChange(p);
              }}
              className={cn(
                "h-7 min-w-7 rounded-md border px-2 text-[13px] font-medium tabular-nums transition-colors",
                p === safePage
                  ? "border-primary bg-primary text-primary-foreground shadow-2xs"
                  : "border-input bg-card hover:bg-accent",
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button
          type="button"
          variant="outline"
          size="iconSm"
          aria-label="Trang tiếp"
          disabled={safePage >= pageCount}
          onClick={() => onPageChange(Math.min(pageCount, safePage + 1))}
        >
          <ChevronRight className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}

function buildPageList(page: number, pageCount: number): (number | "...")[] {
  if (pageCount <= 7) return Array.from({ length: pageCount }, (_, i) => i + 1);
  const list: (number | "...")[] = [1];
  const start = Math.max(2, page - 1);
  const end = Math.min(pageCount - 1, page + 1);
  if (start > 2) list.push("...");
  for (let i = start; i <= end; i++) list.push(i);
  if (end < pageCount - 1) list.push("...");
  list.push(pageCount);
  return list;
}
