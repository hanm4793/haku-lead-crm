import { z } from "zod";

import {
  BRAND_OPTIONS,
  CATEGORY_OPTIONS,
  FAIL_REASON_OPTIONS,
  SOURCE_OPTIONS,
} from "@/lib/constants";

const enumOf = <T extends string>(values: T[]) => z.enum(values as [T, ...T[]]);

/**
 * Contract giữa client và server cho trang danh sách.
 *
 * Enum nghiệp vụ thì chốt danh sách hợp lệ, còn showroom / phòng bán hàng /
 * người phụ trách / dòng xe để dạng chuỗi tự do vì chúng nằm trong database và
 * thay đổi được — repository truyền chúng vào `inArray` dưới dạng tham số nên
 * không có đường injection.
 */
export const leadFiltersSchema = z.object({
  search: z.string().max(120).default(""),
  tab: z.enum(["ALL", "CHUA_LIEN_HE", "DA_LIEN_HE", "QUA_HAN"]).default("ALL"),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().default(null),
  sources: z.array(enumOf(SOURCE_OPTIONS.map((o) => o.value))).default([]),
  brands: z.array(enumOf(BRAND_OPTIONS.map((o) => o.value))).default([]),
  showrooms: z.array(z.string().max(120)).default([]),
  salesRooms: z.array(z.string().max(160)).default([]),
  assignees: z.array(z.string().max(120)).default([]),
  carModels: z.array(z.string().max(80)).default([]),
  categories: z.array(enumOf([...CATEGORY_OPTIONS.map((o) => o.value), "CHUA_PHAN_LOAI"])).default([]),
  failReasons: z.array(enumOf(FAIL_REASON_OPTIONS.map((o) => o.value))).default([]),
  b10: z.enum(["ALL", "PUSHED", "NOT_PUSHED"]).default("ALL"),
});

export const leadSearchSchema = z.object({
  filters: leadFiltersSchema,
  sortBy: z.string().max(40).default("createdAt"),
  sortOrder: z.enum(["asc", "desc"]).default("desc"),
  page: z.number().int().min(1).max(10000).default(1),
  pageSize: z.number().int().min(1).max(500).default(50),
});

export type LeadSearchInput = z.infer<typeof leadSearchSchema>;
