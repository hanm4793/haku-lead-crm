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

function calendarUtc(value: string): number {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return Number.NaN;
  return Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

function formatUtcDate(utc: number): string {
  const date = new Date(utc);
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");
  const day = String(date.getUTCDate()).padStart(2, "0");
  return `${date.getUTCFullYear()}-${month}-${day}`;
}

/**
 * Khoảng liền trước, cùng số ngày, tính trên lịch (không phụ thuộc timezone máy).
 * "Tháng này" 01–26/09 so với 06–31/08, không bị lệch sang ngày đầu kỳ hiện tại.
 */
export function previousCalendarRange(from: string, to: string): DateRange {
  const start = calendarUtc(from);
  const end = calendarUtc(to);
  if (Number.isNaN(start) || Number.isNaN(end) || end < start) {
    return { from: null, to: null };
  }
  const days = Math.round((end - start) / 86_400_000) + 1;
  return {
    from: formatUtcDate(start - days * 86_400_000),
    to: formatUtcDate(start - 86_400_000),
  };
}

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
