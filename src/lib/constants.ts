import type {
  BrandCode,
  CatalogLabels,
  ChannelDetail,
  ContactStatus,
  FailReason,
  LeadCategory,
  LeadSource,
} from "./types";

export interface Option<T extends string> {
  value: T;
  label: string;
  hint?: string;
  color?: string;
}

export const CONTACT_STATUS_OPTIONS: Option<ContactStatus>[] = [
  { value: "DA_LIEN_HE", label: "Đã liên hệ" },
  { value: "CHUA_LIEN_HE", label: "Chưa liên hệ" },
];

export const CATEGORY_OPTIONS: Option<LeadCategory>[] = [
  { value: "KHQT", label: "KHQT", hint: "Khách quan tâm", color: "var(--status-khqt)" },
  { value: "GDTD", label: "GDTD", hint: "Giao dịch theo dõi", color: "var(--status-gdtd)" },
  { value: "KHD", label: "KHĐ", hint: "Ký hợp đồng", color: "var(--status-khd)" },
  { value: "CHUA_LH_DUOC", label: "Chưa LH được", hint: "Chưa liên hệ được", color: "var(--status-chua-lh)" },
  { value: "FAIL", label: "Fail", hint: "Loại", color: "var(--status-fail)" },
];

/** Nhãn dài dùng trong popup chi tiết và biểu đồ. */
export const CATEGORY_LONG_LABEL: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "Chưa phân loại",
  KHQT: "KHQT · Khách quan tâm",
  GDTD: "GDTD · Giao dịch theo dõi",
  KHD: "KHĐ · Ký hợp đồng",
  CHUA_LH_DUOC: "Chưa LH được · Chưa liên hệ được",
  FAIL: "Fail · Loại",
};

export const CATEGORY_CHART_LABEL: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "Chưa phân loại",
  KHQT: "Khách quan tâm",
  GDTD: "Giao dịch theo dõi",
  KHD: "Ký hợp đồng",
  CHUA_LH_DUOC: "Chưa liên hệ được",
  FAIL: "Loại",
};

export const CATEGORY_COLOR: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "#cbd5e1",
  KHQT: "#1f6feb",
  GDTD: "#d97706",
  KHD: "#059669",
  CHUA_LH_DUOC: "#475569",
  FAIL: "#e11d48",
};

export const FAIL_REASON_OPTIONS: Option<FailReason>[] = [
  { value: "SAI_SO", label: "Sai số / không liên lạc được" },
  { value: "KHONG_CO_NHU_CAU", label: "Không có nhu cầu" },
  { value: "DA_MUA_NOI_KHAC", label: "Đã mua xe nơi khác" },
  { value: "CHI_KHAO_GIA", label: "Chỉ khảo giá, không mua" },
  { value: "NGOAI_KHA_NANG_TAI_CHINH", label: "Ngoài khả năng tài chính" },
  { value: "KH_TINH_KHAC", label: "KH ở tỉnh khác" },
  { value: "TRUNG_SPAM", label: "Trùng / spam" },
  { value: "KHAC", label: "Khác" },
];

export const SOURCE_OPTIONS: Option<LeadSource>[] = [
  { value: "FACEBOOK", label: "Facebook" },
  { value: "GOOGLE", label: "Google" },
  { value: "TIKTOK", label: "TikTok" },
  { value: "ZALO", label: "Zalo" },
  { value: "WEBSITE", label: "Website" },
  { value: "HOTLINE", label: "Hotline" },
];

export const CHANNEL_DETAIL_OPTIONS: Option<ChannelDetail>[] = [
  { value: "TIN_NHAN", label: "Tin nhắn" },
  { value: "FORM", label: "Form" },
  { value: "COMMENT", label: "Comment" },
  { value: "CUOC_GOI", label: "Cuộc gọi" },
  { value: "CHAT_WEB", label: "Chat web" },
];

/** Seed / fallback khi DB chưa có project. UI runtime dùng getReferenceData(). */
export const DEFAULT_PROJECT_SLUG = "semtop-auto";

export const DEFAULT_PROJECT_NAME = "Semtop Auto";

/** Nhãn 3 dimension cho project mặc định — fallback khi chưa đọc được DB. */
export const DEFAULT_CATALOG_LABELS: CatalogLabels = {
  brand: "Thương hiệu",
  product: "Dòng xe",
  location: "Showroom",
};

export const DEFAULT_BRAND_SEED: { code: BrandCode; name: string }[] = [
  { code: "KIA", name: "KIA" },
  { code: "MAZDA", name: "Mazda" },
  { code: "PEUGEOT", name: "Peugeot" },
  { code: "BMW", name: "BMW" },
];

/** @deprecated Dùng getReferenceData().brands — giữ cho seed/demo. */
export const BRAND_OPTIONS: Option<BrandCode>[] = DEFAULT_BRAND_SEED.map((b) => ({
  value: b.code,
  label: b.name,
}));

export const LOCATIONS = [
  "Trần Khát Chân",
  "Long Biên",
  "Phạm Văn Đồng",
  "Hà Đông",
  "Gia Lâm",
] as const;

/** @deprecated Dùng LOCATIONS / getReferenceData().locations */
export const SHOWROOMS = LOCATIONS;

export const ASSIGNEES = [
  "Bùi Ngọc Thành",
  "Trần Thanh Điệp",
  "Nguyễn Văn Hải",
  "Lê Minh Tuấn",
  "Phạm Thu Trang",
  "Đặng Quốc Anh",
  "Vũ Thị Hồng",
  "Hoàng Trung Kiên",
] as const;

export const PRODUCTS_BY_BRAND: Record<string, string[]> = {
  KIA: [
    "New Sorento",
    "New Seltos",
    "New Sonet",
    "Carens",
    "New Carnival",
    "K3",
    "Sportage",
    "New Morning",
  ],
  MAZDA: ["CX-5", "CX-8", "CX-3", "Mazda2", "Mazda3", "CX-30"],
  PEUGEOT: ["2008", "3008", "5008", "408"],
  BMW: ["X3", "X5", "Series 3", "Series 5"],
};

/** @deprecated Dùng PRODUCTS_BY_BRAND / getReferenceData().productsByBrand */
export const CAR_MODELS_BY_BRAND = PRODUCTS_BY_BRAND;

export const ALL_PRODUCTS = Object.values(PRODUCTS_BY_BRAND).flat();

/** @deprecated */
export const ALL_CAR_MODELS = ALL_PRODUCTS;

export const UNASSIGNED_PRODUCT_LABEL = "Chưa gán sản phẩm";

/** @deprecated Dùng UNASSIGNED_PRODUCT_LABEL */
export const UNASSIGNED_MODEL_LABEL = UNASSIGNED_PRODUCT_LABEL;

/** Location / phòng BH / brand chưa gán (lead Meta hoặc chưa phân bổ). */
export const UNASSIGNED_ASSIGNMENT_LABEL = "Chưa phân bổ";

export const SOURCE_LABEL: Record<LeadSource, string> = Object.fromEntries(
  SOURCE_OPTIONS.map((o) => [o.value, o.label]),
) as Record<LeadSource, string>;

export const CHANNEL_LABEL: Record<ChannelDetail, string> = Object.fromEntries(
  CHANNEL_DETAIL_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ChannelDetail, string>;

export const FAIL_REASON_LABEL: Record<FailReason, string> = Object.fromEntries(
  FAIL_REASON_OPTIONS.map((o) => [o.value, o.label]),
) as Record<FailReason, string>;

export const CONTACT_STATUS_LABEL: Record<ContactStatus, string> = Object.fromEntries(
  CONTACT_STATUS_OPTIONS.map((o) => [o.value, o.label]),
) as Record<ContactStatus, string>;

export const CATEGORY_SHORT_LABEL: Record<LeadCategory, string> = {
  CHUA_PHAN_LOAI: "—",
  KHQT: "KHQT",
  GDTD: "GDTD",
  KHD: "KHĐ",
  CHUA_LH_DUOC: "Chưa LH được",
  FAIL: "Fail",
};
