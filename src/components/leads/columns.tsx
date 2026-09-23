import {
  B10_STATUS_LABEL,
  CHANNEL_LABEL,
  FAIL_REASON_LABEL,
  SOURCE_LABEL,
  UNASSIGNED_ASSIGNMENT_LABEL,
  UNASSIGNED_MODEL_LABEL,
} from "@/lib/constants";
import type { Lead } from "@/lib/types";
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
  { id: "pushedToB10", header: "B10", width: 80, align: "center", value: (l) => (l.pushedToB10 ? "Đã lên B10" : null) },
  { id: "b10Status", header: "Trạng thái B10", width: 150, value: (l) => B10_STATUS_LABEL[l.b10Status] },
  { id: "b10CareNote", header: "Nội dung chăm sóc B10", width: 230, value: (l) => l.b10CareNote },
  { id: "source", header: "Nguồn", width: 115, sortable: true, value: (l) => SOURCE_LABEL[l.source] },
  {
    id: "brand",
    header: "Thương hiệu",
    width: 125,
    sortable: true,
    value: (l) => l.brand ?? UNASSIGNED_ASSIGNMENT_LABEL,
  },
  { id: "carModel", header: "Dòng xe", width: 140, sortable: true, value: (l) => l.carModel ?? UNASSIGNED_MODEL_LABEL },
  { id: "showroom", header: "Showroom", width: 150, sortable: true, value: (l) => l.showroom || UNASSIGNED_ASSIGNMENT_LABEL },
  { id: "salesRoom", header: "Phòng bán hàng", width: 250, value: (l) => l.salesRoom || UNASSIGNED_ASSIGNMENT_LABEL },
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
  "pushedToB10",
  "b10Status",
  "b10CareNote",
  "source",
  "brand",
  "carModel",
  "showroom",
  "salesRoom",
  "assignee",
  "careNote",
  "callbackAt",
];

export const COLUMN_BY_ID = new Map(LEAD_COLUMNS.map((c) => [c.id, c]));

/** Chuỗi hiển thị trong ô — cũng dùng làm giá trị ô Excel. */
export function displayValue(lead: Lead, columnId: string): string {
  const column = COLUMN_BY_ID.get(columnId);
  if (!column) return "";
  const raw = column.value(lead);
  if (raw === null || raw === undefined || raw === "") return "";
  if (columnId === "createdAt" || columnId === "lastContactAt") return formatDateTime(String(raw));
  if (columnId === "callbackAt") return formatDate(String(raw));
  if (columnId === "costPerLead") return new Intl.NumberFormat("vi-VN").format(Number(raw));
  return String(raw);
}
