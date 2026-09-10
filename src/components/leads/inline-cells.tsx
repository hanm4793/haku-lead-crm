"use client";

import { Check, ChevronDown, PhoneOff } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { CATEGORY_OPTIONS, CONTACT_STATUS_OPTIONS } from "@/lib/constants";
import type { ContactStatus, LeadCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ContactStatusCell({
  value,
  onChange,
}: {
  value: ContactStatus;
  onChange: (next: ContactStatus) => void;
}) {
  const contacted = value === "DA_LIEN_HE";
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          contacted
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
        )}
      >
        {contacted ? <Check className="size-3" /> : <PhoneOff className="size-3" />}
        {contacted ? "Đã liên hệ" : "Chưa liên hệ"}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Trạng thái liên hệ</DropdownMenuLabel>
        {CONTACT_STATUS_OPTIONS.map((option) => (
          <DropdownMenuItem key={option.value} onSelect={() => onChange(option.value)}>
            {option.value === "DA_LIEN_HE" ? (
              <Check className="size-3.5 text-emerald-600" />
            ) : (
              <PhoneOff className="size-3.5 text-blue-600" />
            )}
            {option.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

const CATEGORY_CHIP_CLASS: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "border-slate-200 bg-slate-50 text-slate-500 hover:bg-slate-100",
  KHQT: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  GDTD: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  KHD: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  CHUA_LH_DUOC: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
  FAIL: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
};

export function CategoryCell({
  value,
  onChange,
}: {
  value: LeadCategory;
  onChange: (next: LeadCategory) => void;
}) {
  const option = CATEGORY_OPTIONS.find((o) => o.value === value);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          CATEGORY_CHIP_CLASS[value],
        )}
      >
        {option?.label ?? "—"}
        <ChevronDown className="size-3 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-60" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Phân loại khách</DropdownMenuLabel>
        {CATEGORY_OPTIONS.map((item) => (
          <DropdownMenuItem key={item.value} onSelect={() => onChange(item.value)} className="gap-2">
            <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
            <span className="font-medium">{item.label}</span>
            <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
