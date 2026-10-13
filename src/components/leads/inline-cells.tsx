"use client";

import * as React from "react";
import { Check, ChevronDown, ChevronRight, PhoneOff, UserCheck, UserX } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  CATEGORY_OPTIONS,
  CATEGORY_SHORT_LABEL,
  CONTACT_STATUS_OPTIONS,
  FAIL_REASON_OPTIONS,
} from "@/lib/constants";
import type { ContactStatus, FailReason, LeadCategory } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ContactStatusCell({
  value,
  onChange,
  editable = true,
}: {
  value: ContactStatus;
  onChange: (next: ContactStatus) => void;
  editable?: boolean;
}) {
  const contacted = value === "DA_LIEN_HE";
  const chip = (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
        contacted ? "border-emerald-200 bg-emerald-50 text-emerald-700" : "border-blue-200 bg-blue-50 text-blue-700",
      )}
    >
      {contacted ? <Check className="size-3 shrink-0" /> : <PhoneOff className="size-3 shrink-0" />}
      {contacted ? "Đã liên hệ" : "Chưa liên hệ"}
    </span>
  );
  if (!editable) return chip;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          contacted
            ? "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100"
            : "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
        )}
      >
        {contacted ? <Check className="size-3 shrink-0" /> : <PhoneOff className="size-3 shrink-0" />}
        {contacted ? "Đã liên hệ" : "Chưa liên hệ"}
        <ChevronDown className="size-3 shrink-0 opacity-60" />
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

export const CATEGORY_CHIP_CLASS: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100",
  KHQT: "border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100",
  GDTD: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
  KHD: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100",
  CHUA_LH_DUOC: "border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200",
  FAIL: "border-rose-200 bg-rose-50 text-rose-700 hover:bg-rose-100",
};

const INLINE_CATEGORY_ITEMS: { value: LeadCategory; label: string; hint: string; color: string }[] = [
  { value: "CHUA_PHAN_LOAI", label: "Chưa phân loại", hint: "Mặc định", color: "#94a3b8" },
  ...CATEGORY_OPTIONS.map((o) => ({
    value: o.value,
    label: o.label,
    hint: o.hint ?? "",
    color: o.color ?? "#64748b",
  })),
];

export function CategoryCell({
  value,
  onChange,
  editable = true,
}: {
  value: LeadCategory;
  onChange: (next: LeadCategory, failReason?: FailReason | null) => void;
  editable?: boolean;
}) {
  const [showFailReasons, setShowFailReasons] = React.useState(false);
  const label = CATEGORY_SHORT_LABEL[value] ?? "Chưa phân loại";

  if (!editable) {
    return (
      <span
        className={cn(
          "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium",
          CATEGORY_CHIP_CLASS[value],
        )}
      >
        {label}
      </span>
    );
  }

  return (
    <DropdownMenu
      onOpenChange={(open) => {
        if (!open) setShowFailReasons(false);
      }}
    >
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-medium transition-colors",
          CATEGORY_CHIP_CLASS[value],
        )}
      >
        {label}
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64" onClick={(e) => e.stopPropagation()}>
        {!showFailReasons ? (
          <>
            <DropdownMenuLabel>Phân loại khách</DropdownMenuLabel>
            {INLINE_CATEGORY_ITEMS.map((item) => {
              if (item.value === "FAIL") {
                return (
                  <DropdownMenuItem
                    key={item.value}
                    onSelect={(e) => {
                      e.preventDefault();
                      setShowFailReasons(true);
                    }}
                    className="gap-2"
                  >
                    <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                    <span className="font-medium">{item.label}</span>
                    <span className="ml-auto inline-flex items-center gap-1 text-xs text-muted-foreground">
                      {item.hint}
                      <ChevronRight className="size-3" />
                    </span>
                  </DropdownMenuItem>
                );
              }
              return (
                <DropdownMenuItem
                  key={item.value}
                  onSelect={() => onChange(item.value, null)}
                  className="gap-2"
                >
                  <span className="size-2 shrink-0 rounded-full" style={{ background: item.color }} />
                  <span className="font-medium">{item.label}</span>
                  <span className="ml-auto text-xs text-muted-foreground">{item.hint}</span>
                </DropdownMenuItem>
              );
            })}
          </>
        ) : (
          <>
            <DropdownMenuLabel className="flex items-center justify-between">
              <span>Chọn lý do Fail</span>
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowFailReasons(false);
                }}
                className="text-[11px] font-normal text-primary hover:underline"
              >
                ← Quay lại
              </button>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            {FAIL_REASON_OPTIONS.map((reason) => (
              <DropdownMenuItem
                key={reason.value}
                onSelect={() => onChange("FAIL", reason.value)}
                className="text-xs"
              >
                {reason.label}
              </DropdownMenuItem>
            ))}
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function AssigneeCell({
  value,
  assignees,
  editable = false,
  onChange,
}: {
  value: string | null;
  assignees: readonly string[];
  editable?: boolean;
  onChange: (next: string | null) => void;
}) {
  if (!editable) {
    if (!value) {
      return (
        <span className="inline-flex items-center whitespace-nowrap rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-medium text-amber-700">
          Chưa giao
        </span>
      );
    }
    return (
      <span className="block truncate text-slate-700" title={value}>
        {value}
      </span>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        onClick={(e) => e.stopPropagation()}
        className={cn(
          "inline-flex max-w-full items-center gap-1 rounded-md border px-2 py-1 text-xs font-medium transition-colors",
          value
            ? "border-slate-200 bg-white text-slate-700 hover:border-primary/40 hover:bg-slate-50"
            : "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100",
        )}
      >
        <span className="truncate">{value ?? "Chưa giao"}</span>
        <ChevronDown className="size-3 shrink-0 opacity-60" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-64 w-52 overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <DropdownMenuLabel>Giao người phụ trách</DropdownMenuLabel>
        <DropdownMenuItem onSelect={() => onChange(null)} className="gap-2 text-amber-700">
          <UserX className="size-3.5" />
          Chưa giao
        </DropdownMenuItem>
        {assignees.length > 0 && <DropdownMenuSeparator />}
        {assignees.map((name) => (
          <DropdownMenuItem key={name} onSelect={() => onChange(name)} className="gap-2">
            <UserCheck className={cn("size-3.5", value === name ? "text-primary" : "text-slate-400")} />
            <span className={cn("truncate", value === name && "font-semibold text-primary")}>{name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
