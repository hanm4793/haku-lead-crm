import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const pad = (n: number) => String(n).padStart(2, "0");

const VN_OFFSET_MS = 7 * 60 * 60 * 1000;

/** Tách các thành phần ngày/giờ theo múi giờ Việt Nam (Asia/Ho_Chi_Minh, UTC+7). */
export function toVnParts(d: Date) {
  const vn = new Date(d.getTime() + VN_OFFSET_MS);
  return {
    year: vn.getUTCFullYear(),
    month: vn.getUTCMonth(),
    day: vn.getUTCDate(),
    hours: vn.getUTCHours(),
    minutes: vn.getUTCMinutes(),
    dayOfWeek: vn.getUTCDay(),
  };
}

/** 16:06 05/08/2026 — đúng định dạng đang dùng trên hệ thống hiện tại (giờ VN UTC+7). */
export function formatDateTime(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const { year, month, day, hours, minutes } = toVnParts(d);
  return `${pad(hours)}:${pad(minutes)} ${pad(day)}/${pad(month + 1)}/${year}`;
}

export function formatDate(iso: string | null | undefined) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  const { year, month, day } = toVnParts(d);
  return `${pad(day)}/${pad(month + 1)}/${year}`;
}

/** yyyy-MM-dd theo giờ Việt Nam (UTC+7) để đổ vào <input type="date"> */
export function toDateInputValue(iso: string | null | undefined) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day } = toVnParts(d);
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** yyyy-MM-ddTHH:mm theo giờ Việt Nam (UTC+7) để đổ vào <input type="datetime-local"> */
export function toDateTimeLocalValue(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const { year, month, day, hours, minutes } = toVnParts(d);
  return `${year}-${pad(month + 1)}-${pad(day)}T${pad(hours)}:${pad(minutes)}`;
}

export function formatNumber(n: number) {
  return new Intl.NumberFormat("vi-VN").format(n);
}

export function formatPercent(value: number, digits = 1) {
  if (!Number.isFinite(value)) return "0%";
  return `${value.toFixed(digits)}%`;
}

export function formatCurrency(n: number | null) {
  if (n === null) return "—";
  return new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 }).format(n);
}

export function ratio(part: number, total: number) {
  return total === 0 ? 0 : (part / total) * 100;
}

export function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

export function addDays(d: Date, days: number) {
  const x = new Date(d);
  x.setDate(x.getDate() + days);
  return x;
}
