import { toVnParts } from "@/lib/utils";

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

export function resolvePreset(
  preset: PresetId | "YESTERDAY" | "THIS_WEEK",
  now: Date = new Date(),
): DateRange {
  const vn = toVnParts(now);
  const ymd = (y: number, m: number, d: number) => formatUtcDate(Date.UTC(y, m, d));
  const today = ymd(vn.year, vn.month, vn.day);
  switch (preset) {
    case "TODAY":
      return { from: today, to: today };
    case "YESTERDAY": {
      const yesterday = ymd(vn.year, vn.month, vn.day - 1);
      return { from: yesterday, to: yesterday };
    }
    case "THIS_WEEK": {
      const dayOfWeek = (vn.dayOfWeek + 6) % 7;
      return { from: ymd(vn.year, vn.month, vn.day - dayOfWeek), to: today };
    }
    case "LAST_7":
      return { from: ymd(vn.year, vn.month, vn.day - 6), to: today };
    case "LAST_30":
      return { from: ymd(vn.year, vn.month, vn.day - 29), to: today };
    case "THIS_MONTH":
      return { from: ymd(vn.year, vn.month, 1), to: today };
    case "LAST_MONTH":
      return {
        from: ymd(vn.year, vn.month - 1, 1),
        to: ymd(vn.year, vn.month, 0),
      };
    case "THIS_QUARTER": {
      const q = Math.floor(vn.month / 3);
      return { from: ymd(vn.year, q * 3, 1), to: today };
    }
    default:
      return { from: null, to: null };
  }
}
