import { z } from "zod";

import { LEAD_COLUMNS } from "@/components/leads/columns";
import { CATEGORY_OPTIONS, FAIL_REASON_OPTIONS, SOURCE_OPTIONS } from "@/lib/constants";
import { PIVOT_DIMENSIONS } from "@/lib/metrics";

export const COLUMN_IDS = LEAD_COLUMNS.map((c) => c.id) as [string, ...string[]];
const SPLIT_DIMENSIONS = Object.keys(PIVOT_DIMENSIONS) as [string, ...string[]];

/**
 * "Đơn hàng export" mà LLM được phép tạo ra.
 *
 * LLM không sinh SQL và không sinh dữ liệu — nó chỉ điền vào cấu trúc này.
 * Backend validate bằng schema, tự áp quyền của người dùng rồi mới truy vấn,
 * nên sai sót tệ nhất của model chỉ là lọc sai chứ không thể rò rỉ dữ liệu.
 *
 * Brand / sản phẩm / location / người phụ trách là danh mục
 * trong DB nên để chuỗi tự do; danh sách hợp lệ được đưa vào system prompt và
 * `refineSpec` dò lại theo tên. Repository bind chúng làm tham số `inArray`.
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
  brands: z.array(z.string().max(40)).optional().describe("Mã thương hiệu khách quan tâm, đúng theo danh sách hợp lệ"),
  products: z.array(z.string().max(80)).optional().describe("BẮT BUỘC điền khi người dùng nhắc tên sản phẩm / dòng xe, đúng theo danh sách hợp lệ"),
  locations: z.array(z.string().max(120)).optional().describe("Địa điểm / showroom. Bỏ trống nếu không giới hạn — kể cả khi tách sheet theo địa điểm"),
  assignees: z.array(z.string().max(120)).optional().describe("Nhân viên phụ trách"),
  facebookPageIds: z
    .array(z.string().regex(/^\d{5,}$/))
    .optional()
    .describe("Meta Fanpage IDs — lọc lead theo trang Facebook nguồn"),
  overdueOnly: z.boolean().optional().describe("Chỉ lấy lead quá hạn gọi lại"),
});

export const exportSpecSchema = z.object({
  title: z.string().describe("Tên file gợi ý, không kèm phần mở rộng"),
  summary: z.string().describe("Một câu tiếng Việt mô tả nội dung sẽ xuất, để người dùng xác nhận"),
  filters: exportFiltersSchema,
  columns: z.array(z.string().min(1).max(100)).min(1).describe("Danh sách cột theo đúng thứ tự muốn xuất"),
  splitSheetsBy: z.enum(SPLIT_DIMENSIONS).nullable().optional().describe("Tách mỗi giá trị của chiều này thành một sheet riêng"),
  sortBy: z.string().optional(),
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
  "product",
  "location",
  "assignee",
];
