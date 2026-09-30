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

export type LeadSource = "FACEBOOK" | "GOOGLE" | "TIKTOK" | "ZALO" | "WEBSITE" | "HOTLINE";

export type ChannelDetail = "TIN_NHAN" | "FORM" | "COMMENT" | "CUOC_GOI" | "CHAT_WEB";

/** Mã brand trong catalog (vd. KIA). Không còn enum Postgres cố định. */
export type BrandCode = string;

export type ActivityKind =
  | "CALL"
  | "STATUS_CHANGE"
  | "CATEGORY_CHANGE"
  | "ASSIGN_CHANGE"
  | "MISSED_CALL"
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

export interface CatalogLabels {
  brand: string;
  product: string;
  location: string;
}

export interface ProjectInfo {
  id: string;
  slug: string;
  name: string;
  labels: CatalogLabels;
}

export interface Lead {
  id: string;
  createdAt: string;
  name: string | null;
  phone: string;
  contactStatus: ContactStatus;
  category: LeadCategory;
  failReason: FailReason | null;
  source: LeadSource;
  channelDetail: ChannelDetail;
  /** Mã brand (code), null nếu chưa gán. */
  brand: BrandCode | null;
  brandId: string | null;
  location: string;
  locationId: string | null;
  assigneeId: string | null;
  assignee: string | null;
  product: string | null;
  productId: string | null;
  /** Field phụ / FB form không map vào 3 dimension. */
  attrs: Record<string, string>;
  careNote: string | null;
  /** Hẹn gọi lại — dùng để tính "quá hạn". */
  callbackAt: string | null;
  contactCount: number;
  lastContactAt: string | null;
  campaign: string | null;
  adContent: string | null;
  costPerLead: number | null;
  /** Meta Page ID khi lead đến từ Facebook Lead Ads. */
  facebookPageId: string | null;
}

export interface LeadFilters {
  search: string;
  tab: "ALL" | "CHUA_LIEN_HE" | "DA_LIEN_HE" | "QUA_HAN";
  dateFrom: string | null;
  dateTo: string | null;
  sources: LeadSource[];
  /** Brand codes. */
  brands: BrandCode[];
  locations: string[];
  assignees: string[];
  products: string[];
  categories: LeadCategory[];
  failReasons: FailReason[];
  /** Meta Page IDs — lọc lead theo Fanpage nguồn. */
  facebookPageIds: string[];
}

export interface LeadKpis {
  total: number;
  contacted: number;
  /** total - contacted */
  uncontacted: number;
  contactRate: number;
  khqt: number;
  /** KHQT trở lên / đã liên hệ */
  khqtRate: number;
  gdtd: number;
  khd: number;
  failed: number;
  failRate: number;
  overdue: number;
}
