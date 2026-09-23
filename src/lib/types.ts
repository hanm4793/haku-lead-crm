/** Trạng thái liên hệ — cột TRẠNG THÁI trên bảng lead. */
export type ContactStatus = "CHUA_LIEN_HE" | "DA_LIEN_HE";

/** Phân loại khách — cột PHÂN LOẠI. */
export type LeadCategory =
  | "CHUA_PHAN_LOAI"
  | "KHQT"
  | "GDTD"
  | "KHD"
  | "CHUA_LH_DUOC"
  | "FAIL";

/** Lý do loại — chỉ áp dụng khi phân loại = FAIL. */
export type FailReason =
  | "SAI_SO"
  | "KHONG_CO_NHU_CAU"
  | "DA_MUA_NOI_KHAC"
  | "CHI_KHAO_GIA"
  | "NGOAI_KHA_NANG_TAI_CHINH"
  | "KH_TINH_KHAC"
  | "TRUNG_SPAM"
  | "KHAC";

/** Trạng thái đối soát với hệ thống B10 (DDMS). */
export type B10Status = "CHUA_CO_TREN_B10" | "DA_CO_TREN_B10" | "TRUNG_B10";

export type LeadSource = "FACEBOOK" | "GOOGLE" | "TIKTOK" | "ZALO" | "WEBSITE" | "HOTLINE";

export type ChannelDetail = "TIN_NHAN" | "FORM" | "COMMENT" | "CUOC_GOI" | "CHAT_WEB";

export type Brand = "KIA" | "MAZDA" | "PEUGEOT" | "BMW";

export type ActivityKind =
  | "CALL"
  | "STATUS_CHANGE"
  | "CATEGORY_CHANGE"
  | "ASSIGN_CHANGE"
  | "MISSED_CALL"
  | "B10_SYNC"
  | "NOTE"
  | "CREATE";

export interface ActivityLog {
  id: string;
  leadId: string;
  kind: ActivityKind;
  message: string;
  at: string;
  actor: string;
  /** Ghi nhận hành động do AI thực hiện thay vì người dùng. */
  byAi?: boolean;
}

export interface Lead {
  id: string;
  createdAt: string;
  name: string | null;
  phone: string;
  contactStatus: ContactStatus;
  category: LeadCategory;
  failReason: FailReason | null;
  /** Đã đẩy sang B10 hay chưa (cột B10). */
  pushedToB10: boolean;
  b10Status: B10Status;
  b10CareNote: string | null;
  source: LeadSource;
  channelDetail: ChannelDetail;
  brand: Brand | null;
  showroom: string;
  salesRoom: string;
  assignee: string | null;
  carModel: string | null;
  careNote: string | null;
  /** Hẹn gọi lại — dùng để tính "quá hạn". */
  callbackAt: string | null;
  contactCount: number;
  lastContactAt: string | null;
  campaign: string | null;
  adContent: string | null;
  costPerLead: number | null;
}

export interface LeadFilters {
  search: string;
  tab: "ALL" | "CHUA_LIEN_HE" | "DA_LIEN_HE" | "QUA_HAN";
  dateFrom: string | null;
  dateTo: string | null;
  sources: LeadSource[];
  brands: Brand[];
  showrooms: string[];
  salesRooms: string[];
  assignees: string[];
  carModels: string[];
  categories: LeadCategory[];
  failReasons: FailReason[];
  b10: "ALL" | "PUSHED" | "NOT_PUSHED";
}

export interface LeadKpis {
  total: number;
  contacted: number;
  contactRate: number;
  khqt: number;
  khqtRate: number;
  gdtd: number;
  khd: number;
  failed: number;
  failRate: number;
  overdue: number;
}
