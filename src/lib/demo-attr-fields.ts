import type { AttrFieldType } from "@/lib/db/attr-fields-repo";

/**
 * Cấu hình field phụ mẫu phủ đủ mọi kiểu dữ liệu hỗ trợ (text / number / select / date),
 * nạp bằng `pnpm db:seed` vào project Semtop Auto để thử luồng cấu hình → bảng lead → popup chi tiết.
 */
export interface DemoAttrField {
  key: string;
  label: string;
  fieldType: AttrFieldType;
  options?: string[];
  active?: boolean;
}

export const DEMO_ATTR_FIELDS: DemoAttrField[] = [
  { key: "khu_vuc_song", label: "Khu vực sinh sống", fieldType: "text" },
  { key: "ghi_chu_xe_hien_tai", label: "Xe đang sử dụng", fieldType: "text" },
  { key: "so_xe_hien_co", label: "Số xe hiện có", fieldType: "number" },
  { key: "ngan_sach_du_kien", label: "Ngân sách dự kiến (triệu)", fieldType: "number" },
  {
    key: "ngan_sach",
    label: "Khoảng ngân sách",
    fieldType: "select",
    options: ["Dưới 500 triệu", "500 triệu - 1 tỷ", "1 - 2 tỷ", "Trên 2 tỷ"],
  },
  {
    key: "muc_dich_su_dung",
    label: "Mục đích sử dụng",
    fieldType: "select",
    options: ["Gia đình", "Kinh doanh dịch vụ", "Công ty"],
  },
  { key: "du_kien_mua", label: "Dự kiến mua", fieldType: "date" },
  { key: "ngay_hen_lai_thu", label: "Ngày hẹn lái thử", fieldType: "date" },
  // Field đã tắt: để thử trường hợp field bị tắt không còn hiện cột / ô nhập.
  { key: "ma_gioi_thieu", label: "Mã giới thiệu (đã tắt)", fieldType: "text", active: false },
];
