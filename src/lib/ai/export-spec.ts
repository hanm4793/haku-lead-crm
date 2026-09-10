import { z } from "zod";

import { LEAD_COLUMNS } from "@/components/leads/columns";
import {
  ALL_CAR_MODELS,
  ASSIGNEES,
  BRAND_OPTIONS,
  CATEGORY_OPTIONS,
  FAIL_REASON_OPTIONS,
  SALES_ROOMS,
  SHOWROOMS,
  SOURCE_OPTIONS,
} from "@/lib/constants";
import { PIVOT_DIMENSIONS } from "@/lib/metrics";

const COLUMN_IDS = LEAD_COLUMNS.map((c) => c.id) as [string, ...string[]];
const SPLIT_DIMENSIONS = Object.keys(PIVOT_DIMENSIONS) as [string, ...string[]];

/**
 * "Đơn hàng export" mà LLM được phép tạo ra.
 *
 * LLM không sinh SQL và không sinh dữ liệu — nó chỉ điền vào cấu trúc này.
 * Backend validate bằng schema, tự áp quyền của người dùng rồi mới truy vấn,
 * nên sai sót tệ nhất của model chỉ là lọc sai chứ không thể rò rỉ dữ liệu.
 */
export const exportFiltersSchema = z.object({
  search: z.string().optional().describe("Từ khóa tìm theo tên khách hoặc số điện thoại"),
  dateField: z.enum(["createdAt", "callbackAt", "lastContactAt"]).optional().describe("Trường thời gian dùng để lọc, mặc định createdAt"),
  dateFrom: z.string().nullable().optional().describe("Ngày bắt đầu, định dạng yyyy-MM-dd"),
  dateTo: z.string().nullable().optional().describe("Ngày kết thúc, định dạng yyyy-MM-dd"),
  contactStatus: z.enum(["DA_LIEN_HE", "CHUA_LIEN_HE"]).nullable().optional(),
  categories: z.array(z.enum(CATEGORY_OPTIONS.map((o) => o.value) as [string, ...string[]])).optional(),
  failReasons: z.array(z.enum(FAIL_REASON_OPTIONS.map((o) => o.value) as [string, ...string[]])).optional(),
  sources: z.array(z.enum(SOURCE_OPTIONS.map((o) => o.value) as [string, ...string[]])).optional().describe("Nguồn lead. Bỏ trống nếu người dùng không giới hạn nguồn"),
  brands: z.array(z.enum(BRAND_OPTIONS.map((o) => o.value) as [string, ...string[]])).optional().describe("Hãng xe khách quan tâm"),
  carModels: z.array(z.enum(ALL_CAR_MODELS as [string, ...string[]])).optional().describe("BẮT BUỘC điền khi người dùng nhắc tên dòng xe, ví dụ 'New Sonet', 'Seltos', 'Carnival'"),
  showrooms: z.array(z.enum(SHOWROOMS as unknown as [string, ...string[]])).optional().describe("Showroom. Bỏ trống nếu không giới hạn — kể cả khi tách sheet theo showroom"),
  salesRooms: z.array(z.enum(SALES_ROOMS as unknown as [string, ...string[]])).optional(),
  assignees: z.array(z.enum(ASSIGNEES as unknown as [string, ...string[]])).optional().describe("Nhân viên phụ trách"),
  b10: z.enum(["ALL", "PUSHED", "NOT_PUSHED"]).optional(),
  overdueOnly: z.boolean().optional().describe("Chỉ lấy lead quá hạn gọi lại"),
});

export const exportSpecSchema = z.object({
  title: z.string().describe("Tên file gợi ý, không kèm phần mở rộng"),
  summary: z.string().describe("Một câu tiếng Việt mô tả nội dung sẽ xuất, để người dùng xác nhận"),
  filters: exportFiltersSchema,
  columns: z.array(z.enum(COLUMN_IDS)).min(1).describe("Danh sách cột theo đúng thứ tự muốn xuất"),
  splitSheetsBy: z.enum(SPLIT_DIMENSIONS).nullable().optional().describe("Tách mỗi giá trị của chiều này thành một sheet riêng"),
  sortBy: z.enum(COLUMN_IDS).optional(),
  sortOrder: z.enum(["asc", "desc"]).optional(),
  includeSummarySheet: z.boolean().optional().describe("Thêm một sheet tổng hợp chỉ số ở đầu file"),
  format: z.enum(["xlsx", "csv"]).default("xlsx"),
  limit: z.number().int().min(1).max(50000).optional(),
});

export type ExportSpec = z.infer<typeof exportSpecSchema>;
export type ExportFilters = z.infer<typeof exportFiltersSchema>;

export const DEFAULT_EXPORT_COLUMNS = [
  "createdAt",
  "name",
  "phone",
  "contactStatus",
  "category",
  "failReason",
  "source",
  "carModel",
  "showroom",
  "assignee",
];
