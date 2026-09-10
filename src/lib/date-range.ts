import { addDays, toDateInputValue } from "@/lib/utils";

export interface DateRange {
  from: string | null;
  to: string | null;
}

export type PresetId =
  | "ALL"
  | "TODAY"
  | "LAST_7"
  | "LAST_30"
  | "THIS_MONTH"
  | "LAST_MONTH"
  | "THIS_QUARTER"
  | "CUSTOM";

export const DATE_PRESETS: { id: PresetId; label: string }[] = [
  { id: "ALL", label: "Tất cả thời gian" },
  { id: "TODAY", label: "Hôm nay" },
  { id: "LAST_7", label: "7 ngày gần nhất" },
  { id: "LAST_30", label: "30 ngày gần nhất" },
  { id: "THIS_MONTH", label: "Tháng này" },
  { id: "LAST_MONTH", label: "Tháng trước" },
  { id: "THIS_QUARTER", label: "Quý này" },
  { id: "CUSTOM", label: "Tùy chỉnh" },
];

export function resolvePreset(preset: PresetId, now: Date = new Date()): DateRange {
  const iso = (d: Date) => toDateInputValue(d.toISOString());
  switch (preset) {
    case "TODAY":
      return { from: iso(now), to: iso(now) };
    case "LAST_7":
      return { from: iso(addDays(now, -6)), to: iso(now) };
    case "LAST_30":
      return { from: iso(addDays(now, -29)), to: iso(now) };
    case "THIS_MONTH":
      return { from: iso(new Date(now.getFullYear(), now.getMonth(), 1)), to: iso(now) };
    case "LAST_MONTH": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return { from: iso(first), to: iso(last) };
    }
    case "THIS_QUARTER": {
      const q = Math.floor(now.getMonth() / 3);
      return { from: iso(new Date(now.getFullYear(), q * 3, 1)), to: iso(now) };
    }
    default:
      return { from: null, to: null };
  }
}
