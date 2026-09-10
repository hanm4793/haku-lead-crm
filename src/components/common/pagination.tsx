"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";

const PAGE_SIZES = [25, 50, 100, 200];

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
  onPageSizeChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}) {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);

  const pages = buildPageList(page, pageCount);

  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border bg-card px-4 py-2.5 text-[13px]">
      <div className="flex items-center gap-3">
        <span className="text-muted-foreground">
          Hiển thị {formatNumber(first)}–{formatNumber(last)} / {formatNumber(total)} khách
        </span>
        <select
          value={pageSize}
          onChange={(e) => onPageSizeChange(Number(e.target.value))}
          className="h-7 rounded-md border border-input bg-card px-2 text-[13px] outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
        >
          {PAGE_SIZES.map((size) => (
            <option key={size} value={size}>
              {size}/trang
            </option>
          ))}
        </select>
      </div>

      <div className="flex items-center gap-1">
        <Button variant="outline" size="iconSm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
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
              onClick={() => onPageChange(p)}
              className={cn(
                "h-7 min-w-7 rounded-md border px-2 text-[13px] transition-colors",
                p === page
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-input bg-card hover:bg-accent",
              )}
            >
              {p}
            </button>
          ),
        )}
        <Button variant="outline" size="iconSm" disabled={page >= pageCount} onClick={() => onPageChange(page + 1)}>
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
