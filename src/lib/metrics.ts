import {
  CATEGORY_CHART_LABEL,
  FAIL_REASON_LABEL,
  SOURCE_LABEL,
  UNASSIGNED_ASSIGNMENT_LABEL,
  UNASSIGNED_MODEL_LABEL,
} from "./constants";
import { isOverdue } from "./filters";
import type { Lead, LeadCategory, LeadKpis } from "./types";
import { ratio } from "./utils";

const INTERESTED: LeadCategory[] = ["KHQT", "GDTD", "KHD"];
const IN_DEAL: LeadCategory[] = ["GDTD", "KHD"];

export function computeKpis(leads: Lead[], now: Date = new Date()): LeadKpis {
  const total = leads.length;
  const contacted = leads.filter((l) => l.contactStatus === "DA_LIEN_HE").length;
  const khqt = leads.filter((l) => INTERESTED.includes(l.category)).length;
  const gdtd = leads.filter((l) => IN_DEAL.includes(l.category)).length;
  const khd = leads.filter((l) => l.category === "KHD").length;
  const failed = leads.filter((l) => l.category === "FAIL").length;
  const overdue = leads.filter((l) => isOverdue(l, now)).length;

  return {
    total,
    contacted,
    contactRate: ratio(contacted, total),
    khqt,
    khqtRate: ratio(khqt, contacted),
    gdtd,
    khd,
    failed,
    failRate: ratio(failed, total),
    overdue,
  };
}

export interface FunnelStep {
  label: string;
  value: number;
  /** % so với tổng lead */
  shareOfTotal: number;
  /** % chuyển đổi từ bậc liền trước */
  stepConversion: number;
}

export function computeFunnel(leads: Lead[]): FunnelStep[] {
  const total = leads.length;
  const contacted = leads.filter((l) => l.contactStatus === "DA_LIEN_HE").length;
  const interested = leads.filter((l) => INTERESTED.includes(l.category)).length;
  const inDeal = leads.filter((l) => IN_DEAL.includes(l.category)).length;
  const signed = leads.filter((l) => l.category === "KHD").length;

  const raw: [string, number][] = [
    ["Tổng lead", total],
    ["Đã liên hệ", contacted],
    ["Quan tâm trở lên", interested],
    ["Đang giao dịch trở lên", inDeal],
    ["Ký hợp đồng", signed],
  ];

  return raw.map(([label, value], i) => ({
    label,
    value,
    shareOfTotal: ratio(value, total),
    stepConversion: i === 0 ? 100 : ratio(value, raw[i - 1][1]),
  }));
}

export interface DailyPoint {
  date: string;
  label: string;
  leads: number;
  khqt: number;
}

export function computeDailySeries(leads: Lead[]): DailyPoint[] {
  const buckets = new Map<string, DailyPoint>();
  for (const lead of leads) {
    const d = new Date(lead.createdAt);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    let bucket = buckets.get(key);
    if (!bucket) {
      bucket = {
        date: key,
        label: `${String(d.getDate()).padStart(2, "0")}.${String(d.getMonth() + 1).padStart(2, "0")}`,
        leads: 0,
        khqt: 0,
      };
      buckets.set(key, bucket);
    }
    bucket.leads += 1;
    if (INTERESTED.includes(lead.category)) bucket.khqt += 1;
  }
  return [...buckets.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export interface CategoryShare {
  category: LeadCategory;
  label: string;
  value: number;
}

export function computeCategoryDistribution(leads: Lead[]): CategoryShare[] {
  const order: LeadCategory[] = ["CHUA_PHAN_LOAI", "KHQT", "GDTD", "KHD", "CHUA_LH_DUOC", "FAIL"];
  return order
    .map((category) => ({
      category,
      label: CATEGORY_CHART_LABEL[category],
      value: leads.filter((l) => l.category === category).length,
    }))
    .filter((row) => row.value > 0);
}

export interface SourceBar {
  source: string;
  leads: number;
  khqt: number;
}

export function computeBySource(leads: Lead[]): SourceBar[] {
  const map = new Map<string, SourceBar>();
  for (const lead of leads) {
    const label = SOURCE_LABEL[lead.source];
    const row = map.get(label) ?? { source: label, leads: 0, khqt: 0 };
    row.leads += 1;
    if (INTERESTED.includes(lead.category)) row.khqt += 1;
    map.set(label, row);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads);
}

export interface ModelBar {
  model: string;
  leads: number;
  khqt: number;
}

export function computeByCarModel(leads: Lead[], limit = 10): ModelBar[] {
  const map = new Map<string, ModelBar>();
  for (const lead of leads) {
    const key = lead.carModel ?? UNASSIGNED_MODEL_LABEL;
    const row = map.get(key) ?? { model: key, leads: 0, khqt: 0 };
    row.leads += 1;
    if (INTERESTED.includes(lead.category)) row.khqt += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads).slice(0, limit);
}

export interface FailReasonRow {
  reason: string;
  count: number;
  share: number;
}

export function computeFailReasons(leads: Lead[]): FailReasonRow[] {
  const failed = leads.filter((l) => l.category === "FAIL");
  const map = new Map<string, number>();
  for (const lead of failed) {
    const label = lead.failReason ? FAIL_REASON_LABEL[lead.failReason] : "Không ghi lý do";
    map.set(label, (map.get(label) ?? 0) + 1);
  }
  return [...map.entries()]
    .map(([reason, count]) => ({ reason, count, share: ratio(count, failed.length) }))
    .sort((a, b) => b.count - a.count);
}

export interface SourceQualityRow {
  source: string;
  leads: number;
  khqt: number;
  signed: number;
  closeRate: number;
  lossRate: number;
  /** Chênh lệch tỷ lệ chốt so với kỳ trước (điểm %). */
  closeRateDelta: number;
}

export function computeSourceQuality(leads: Lead[], previousLeads: Lead[] = []): SourceQualityRow[] {
  const build = (input: Lead[]) => {
    const map = new Map<string, { leads: number; khqt: number; signed: number; failed: number }>();
    for (const lead of input) {
      const label = SOURCE_LABEL[lead.source];
      const row = map.get(label) ?? { leads: 0, khqt: 0, signed: 0, failed: 0 };
      row.leads += 1;
      if (INTERESTED.includes(lead.category)) row.khqt += 1;
      if (lead.category === "KHD") row.signed += 1;
      if (lead.category === "FAIL") row.failed += 1;
      map.set(label, row);
    }
    return map;
  };

  const current = build(leads);
  const previous = build(previousLeads);

  return [...current.entries()]
    .map(([source, row]) => {
      const prev = previous.get(source);
      const closeRate = ratio(row.signed, row.leads);
      const prevCloseRate = prev ? ratio(prev.signed, prev.leads) : 0;
      return {
        source,
        leads: row.leads,
        khqt: row.khqt,
        signed: row.signed,
        closeRate,
        lossRate: ratio(row.failed, row.leads),
        closeRateDelta: closeRate - prevCloseRate,
      };
    })
    .sort((a, b) => b.leads - a.leads);
}

/** Các chiều có thể chọn ở tab "Bảng chi tiết". */
export const PIVOT_DIMENSIONS = {
  carModel: "Dòng xe",
  source: "Nguồn",
  category: "Trạng thái",
  brand: "Thương hiệu",
  showroom: "Showroom",
  salesRoom: "Phòng bán hàng",
  assignee: "Phụ trách",
  channelDetail: "Chi tiết kênh",
  campaign: "Chiến dịch",
} as const;

export type PivotDimension = keyof typeof PIVOT_DIMENSIONS;

export function dimensionValue(lead: Lead, dim: PivotDimension): string {
  switch (dim) {
    case "carModel":
      return lead.carModel ?? UNASSIGNED_MODEL_LABEL;
    case "source":
      return SOURCE_LABEL[lead.source];
    case "category":
      return CATEGORY_CHART_LABEL[lead.category];
    case "brand":
      return lead.brand ?? UNASSIGNED_ASSIGNMENT_LABEL;
    case "showroom":
      return lead.showroom;
    case "salesRoom":
      return lead.salesRoom;
    case "assignee":
      return lead.assignee ?? "Chưa giao";
    case "channelDetail":
      return lead.channelDetail;
    case "campaign":
      return lead.campaign ?? "Không gắn chiến dịch";
  }
}

export interface PivotRow {
  key: string;
  leads: number;
  leadShare: number;
  contacted: number;
  contactRate: number;
  khqt: number;
  gdtd: number;
  khd: number;
  signRate: number;
  failed: number;
  failRate: number;
  overdue: number;
  pushedB10: number;
  b10Rate: number;
  khqtB10: number;
  gdtdB10: number;
  khdB10: number;
  failedB10: number;
}

function emptyPivotRow(key: string): PivotRow {
  return {
    key,
    leads: 0,
    leadShare: 0,
    contacted: 0,
    contactRate: 0,
    khqt: 0,
    gdtd: 0,
    khd: 0,
    signRate: 0,
    failed: 0,
    failRate: 0,
    overdue: 0,
    pushedB10: 0,
    b10Rate: 0,
    khqtB10: 0,
    gdtdB10: 0,
    khdB10: 0,
    failedB10: 0,
  };
}

function accumulate(row: PivotRow, lead: Lead, now: Date) {
  row.leads += 1;
  if (lead.contactStatus === "DA_LIEN_HE") row.contacted += 1;
  if (INTERESTED.includes(lead.category)) row.khqt += 1;
  if (IN_DEAL.includes(lead.category)) row.gdtd += 1;
  if (lead.category === "KHD") row.khd += 1;
  if (lead.category === "FAIL") row.failed += 1;
  if (isOverdue(lead, now)) row.overdue += 1;
  if (lead.pushedToB10) {
    row.pushedB10 += 1;
    if (INTERESTED.includes(lead.category)) row.khqtB10 += 1;
    if (IN_DEAL.includes(lead.category)) row.gdtdB10 += 1;
    if (lead.category === "KHD") row.khdB10 += 1;
    if (lead.category === "FAIL") row.failedB10 += 1;
  }
}

function finalize(row: PivotRow, grandTotal: number) {
  row.leadShare = ratio(row.leads, grandTotal);
  row.contactRate = ratio(row.contacted, row.leads);
  row.signRate = ratio(row.khd, row.leads);
  row.failRate = ratio(row.failed, row.leads);
  row.b10Rate = ratio(row.pushedB10, row.leads);
  return row;
}

export interface PivotResult {
  rows: PivotRow[];
  total: PivotRow;
  /** Giá trị của chiều tách cột, rỗng nếu không tách. */
  splitKeys: string[];
  /** rowKey -> splitKey -> chỉ số. Dùng Record để JSON hóa được qua API. */
  split: Record<string, Record<string, PivotRow>>;
}

export function computePivot(
  leads: Lead[],
  groupBy: PivotDimension,
  splitBy: PivotDimension | null = null,
  now: Date = new Date(),
): PivotResult {
  const rows = new Map<string, PivotRow>();
  const total = emptyPivotRow("Tổng");
  const splitAcc = new Map<string, Map<string, PivotRow>>();
  const splitKeySet = new Set<string>();

  for (const lead of leads) {
    const key = dimensionValue(lead, groupBy);
    const row = rows.get(key) ?? emptyPivotRow(key);
    accumulate(row, lead, now);
    rows.set(key, row);
    accumulate(total, lead, now);

    if (splitBy) {
      const sKey = dimensionValue(lead, splitBy);
      splitKeySet.add(sKey);
      const inner = splitAcc.get(key) ?? new Map<string, PivotRow>();
      const cell = inner.get(sKey) ?? emptyPivotRow(sKey);
      accumulate(cell, lead, now);
      inner.set(sKey, cell);
      splitAcc.set(key, inner);
    }
  }

  const grandTotal = total.leads;
  const list = [...rows.values()].map((row) => finalize(row, grandTotal)).sort((a, b) => b.leads - a.leads);
  const split: Record<string, Record<string, PivotRow>> = {};
  for (const [key, inner] of splitAcc) {
    split[key] = {};
    for (const [sKey, cell] of inner) {
      split[key][sKey] = finalize(cell, grandTotal);
    }
  }

  return {
    rows: list,
    total: finalize(total, grandTotal),
    splitKeys: [...splitKeySet].sort(),
    split,
  };
}

/** Khoảng thời gian liền trước cùng độ dài — dùng để so sánh MoM. */
export function previousPeriod(from: Date, to: Date): { from: Date; to: Date } {
  const span = to.getTime() - from.getTime();
  return { from: new Date(from.getTime() - span - 1), to: new Date(from.getTime() - 1) };
}
