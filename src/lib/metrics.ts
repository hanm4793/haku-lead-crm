import {
  CATEGORY_CHART_LABEL,
  DEFAULT_CATALOG_LABELS,
  SOURCE_LABEL,
  UNASSIGNED_ASSIGNMENT_LABEL,
  UNASSIGNED_PRODUCT_LABEL,
} from "./constants";
import { isOverdue } from "./filters";
import type { CatalogLabels, Lead, LeadCategory, LeadKpis } from "./types";
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
    uncontacted: total - contacted,
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

export function computeByProduct(leads: Lead[], limit = 10): ModelBar[] {
  const map = new Map<string, ModelBar>();
  for (const lead of leads) {
    const key = lead.product ?? UNASSIGNED_PRODUCT_LABEL;
    const row = map.get(key) ?? { model: key, leads: 0, khqt: 0 };
    row.leads += 1;
    if (INTERESTED.includes(lead.category)) row.khqt += 1;
    map.set(key, row);
  }
  return [...map.values()].sort((a, b) => b.leads - a.leads).slice(0, limit);
}

/**
 * Các chiều có thể chọn ở tab "Bảng chi tiết". Nhãn của product / brand /
 * location là fallback cho project mặc định — UI có project thì dùng
 * `pivotDimensionLabels(labels)`.
 */
export const PIVOT_DIMENSIONS = {
  source: "Nguồn",
  facebookPage: "Fanpage",
  category: "Trạng thái",
  assignee: "Phụ trách",
  product: DEFAULT_CATALOG_LABELS.product,
  brand: DEFAULT_CATALOG_LABELS.brand,
  location: DEFAULT_CATALOG_LABELS.location,
  channelDetail: "Chi tiết kênh",
  campaign: "Chiến dịch",
} as const;

export type PivotDimension = keyof typeof PIVOT_DIMENSIONS;

/** Nhãn chiều pivot theo nhãn catalog của project đang dùng. */
export function pivotDimensionLabels(labels: CatalogLabels = DEFAULT_CATALOG_LABELS): Record<PivotDimension, string> {
  return {
    ...PIVOT_DIMENSIONS,
    product: labels.product,
    brand: labels.brand,
    location: labels.location,
  };
}

export function dimensionValue(lead: Lead, dim: PivotDimension): string {
  switch (dim) {
    case "product":
      return lead.product ?? UNASSIGNED_PRODUCT_LABEL;
    case "source":
      return SOURCE_LABEL[lead.source];
    case "category":
      return CATEGORY_CHART_LABEL[lead.category];
    case "brand":
      return lead.brand ?? UNASSIGNED_ASSIGNMENT_LABEL;
    case "location":
      return lead.location;
    case "assignee":
      return lead.assignee ?? "Chưa giao";
    case "channelDetail":
      return lead.channelDetail;
    case "campaign":
      return lead.campaign ?? "Không gắn chiến dịch";
    case "facebookPage":
      return lead.facebookPageId ?? "Chưa gắn fanpage";
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
}

function finalize(row: PivotRow, grandTotal: number) {
  row.leadShare = ratio(row.leads, grandTotal);
  row.contactRate = ratio(row.contacted, row.leads);
  row.signRate = ratio(row.khd, row.leads);
  row.failRate = ratio(row.failed, row.leads);
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
    const parentLeads = rows.get(key)?.leads ?? grandTotal;
    split[key] = {};
    for (const [sKey, cell] of inner) {
      // Tỷ trọng dòng con so với hàng cha, không phải tổng toàn bảng.
      split[key][sKey] = finalize(cell, parentLeads);
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
