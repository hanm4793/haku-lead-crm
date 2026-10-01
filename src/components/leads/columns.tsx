import {
  CHANNEL_LABEL,
  DEFAULT_CATALOG_LABELS,
  FAIL_REASON_LABEL,
  SOURCE_LABEL,
  UNASSIGNED_ASSIGNMENT_LABEL,
  UNASSIGNED_PRODUCT_LABEL,
} from "@/lib/constants";
import type { CatalogLabels, Lead } from "@/lib/types";
import { formatDate, formatDateTime } from "@/lib/utils";

export interface LeadColumn {
  id: string;
  header: string;
  width: number;
  sortable?: boolean;
  align?: "left" | "right" | "center";
  /** Giá trị dạng text — dùng cho sắp xếp và cho file Excel. */
  value: (lead: Lead) => string | number | null;
}

export const LEAD_COLUMNS: LeadColumn[] = [
  { id: "createdAt", header: "Thời gian", width: 150, sortable: true, value: (l) => l.createdAt },
  { id: "name", header: "Khách hàng", width: 165, sortable: true, value: (l) => l.name },
  { id: "phone", header: "SĐT", width: 155, sortable: true, value: (l) => l.phone },
  { id: "contactStatus", header: "Trạng thái", width: 145, sortable: true, value: (l) => l.contactStatus },
  { id: "category", header: "Phân loại", width: 140, sortable: true, value: (l) => l.category },
  { id: "failReason", header: "Lý do loại", width: 210, value: (l) => (l.failReason ? FAIL_REASON_LABEL[l.failReason] : null) },
  { id: "source", header: "Nguồn", width: 115, sortable: true, value: (l) => SOURCE_LABEL[l.source] },
  {
    id: "brand",
    header: DEFAULT_CATALOG_LABELS.brand,
    width: 125,
    sortable: true,
    value: (l) => l.brand ?? UNASSIGNED_ASSIGNMENT_LABEL,
  },
  {
    id: "product",
    header: DEFAULT_CATALOG_LABELS.product,
    width: 140,
    sortable: true,
    value: (l) => l.product ?? UNASSIGNED_PRODUCT_LABEL,
  },
  {
    id: "location",
    header: DEFAULT_CATALOG_LABELS.location,
    width: 150,
    sortable: true,
    value: (l) => l.location || UNASSIGNED_ASSIGNMENT_LABEL,
  },
  { id: "assignee", header: "Phụ trách", width: 160, sortable: true, value: (l) => l.assignee },
  { id: "careNote", header: "Nội dung chăm sóc", width: 260, value: (l) => l.careNote },
  { id: "callbackAt", header: "Hẹn gọi lại", width: 130, sortable: true, value: (l) => l.callbackAt },
  { id: "channelDetail", header: "Chi tiết kênh", width: 130, value: (l) => CHANNEL_LABEL[l.channelDetail] },
  { id: "contactCount", header: "Số lần LH", width: 100, align: "right", sortable: true, value: (l) => l.contactCount },
  { id: "lastContactAt", header: "Liên hệ gần nhất", width: 160, sortable: true, value: (l) => l.lastContactAt },
  { id: "campaign", header: "Chiến dịch", width: 220, value: (l) => l.campaign },
  { id: "adContent", header: "Nội dung quảng cáo", width: 190, value: (l) => l.adContent },
  { id: "costPerLead", header: "Chi phí / lead", width: 140, align: "right", sortable: true, value: (l) => l.costPerLead },
];

export const DEFAULT_VISIBLE_COLUMNS = [
  "createdAt",
  "name",
  "phone",
  "contactStatus",
  "category",
  "failReason",
  "source",
  "brand",
  "product",
  "location",
  "assignee",
  "careNote",
  "callbackAt",
];

export const COLUMN_BY_ID = new Map(LEAD_COLUMNS.map((c) => [c.id, c]));

/** Tiêu đề cột theo nhãn catalog của project — ba cột dimension đổi tên theo ngành. */
export function columnHeader(
  columnId: string,
  labels: CatalogLabels = DEFAULT_CATALOG_LABELS,
  attrLabels?: Record<string, string>,
): string {
  if (columnId === "brand") return labels.brand;
  if (columnId === "product") return labels.product;
  if (columnId === "location") return labels.location;
  if (columnId.startsWith("attr:")) {
    const key = columnId.slice(5);
    return attrLabels?.[key] ?? key;
  }
  return COLUMN_BY_ID.get(columnId)?.header ?? columnId;
}

/** Chuỗi hiển thị trong ô — cũng dùng làm giá trị ô Excel. */
export function displayValue(lead: Lead, columnId: string): string {
  if (columnId.startsWith("attr:")) {
    const key = columnId.slice(5);
    return lead.attrs?.[key] ?? "";
  }
  const column = COLUMN_BY_ID.get(columnId);
  if (!column) {
    if (lead.attrs && columnId in lead.attrs) return lead.attrs[columnId] ?? "";
    return "";
  }
  const raw = column.value(lead);
  if (raw === null || raw === undefined || raw === "") return "";
  if (columnId === "createdAt" || columnId === "lastContactAt") return formatDateTime(String(raw));
  if (columnId === "callbackAt") return formatDate(String(raw));
  if (columnId === "costPerLead") return new Intl.NumberFormat("vi-VN").format(Number(raw));
  return String(raw);
}
