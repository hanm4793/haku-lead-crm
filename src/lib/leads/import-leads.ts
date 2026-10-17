import ExcelJS from "exceljs";

import type { UserRole } from "@/lib/auth/roles";
import type { LeadCatalogOptions } from "@/lib/catalog";
import {
  CATEGORY_OPTIONS,
  CHANNEL_DETAIL_OPTIONS,
  FAIL_REASON_OPTIONS,
} from "@/lib/constants";
import type { AttrFieldRow, AttrFieldType } from "@/lib/db/attr-fields-repo";
import type { CreateManualLeadInput, ExistingLeadUniqueEntry } from "@/lib/db/leads-repo";
import { normalizePhone, phoneKey, validatePhone } from "@/lib/leads/phone";
import type { BrandCode, ChannelDetail, FailReason, LeadCategory } from "@/lib/types";

const HEADER_FILL = "FF12479E";
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FIELD_TYPE_VI: Record<AttrFieldType, string> = {
  text: "Văn bản",
  number: "Số",
  select: "Danh sách (chọn 1)",
  multiselect: "Danh sách (chọn nhiều, cách nhau dấu phẩy)",
  boolean: "Có / Không",
  date: "Ngày tháng (yyyy-MM-dd hoặc dd/MM/yyyy)",
};

export interface ImportTemplateOptions {
  catalog: LeadCatalogOptions;
  attrFields: AttrFieldRow[];
  assignees?: string[];
}

export interface FieldValidationSuccess {
  field: string;
  value: string;
}

export interface FieldValidationError {
  field: string;
  value: string;
  error: string;
}

export type ImportRowStatus = "valid" | "partial" | "blocked";

export interface ValidatedImportRow {
  rowNumber: number;
  name: string;
  phone: string;
  email: string;
  status: ImportRowStatus;
  canImport: boolean;
  isDuplicate: boolean;
  blockingError: string | null;
  validFields: FieldValidationSuccess[];
  invalidFields: FieldValidationError[];
  payload: CreateManualLeadInput | null;
}

export interface ImportValidationReport {
  totalRows: number;
  importableCount: number;
  fullyValidCount: number;
  partialValidCount: number;
  blockedCount: number;
  duplicateCount: number;
  unrecognizedColumns: string[];
  rows: ValidatedImportRow[];
}

export interface ImportValidationContext {
  catalog: LeadCatalogOptions;
  attrFields: AttrFieldRow[];
  assignees: string[];
  existingLeads: ExistingLeadUniqueEntry[];
  viewer: {
    role: UserRole;
    appUserId?: string | null;
    fullName?: string | null;
  };
}

function sampleValueForAttrField(field: AttrFieldRow): string {
  switch (field.fieldType) {
    case "number":
      return "500";
    case "boolean":
      return "Có";
    case "date":
      return "2026-10-20";
    case "select":
      return field.options[0] ?? "";
    case "multiselect":
      return field.options.slice(0, 2).join(", ");
    default:
      if (field.key.toLowerCase().includes("email")) return "khachhang.mau@example.com";
      return "Giá trị mẫu";
  }
}

/**
 * Tạo file Excel mẫu (.xlsx) đầy đủ cả các trường cố định và các field phụ đang bật của project.
 * Kèm thêm sheet "Hướng dẫn & Danh mục" liệt kê kiểu dữ liệu và giá trị hợp lệ.
 */
export async function buildLeadImportTemplateWorkbook({
  catalog,
  attrFields,
  assignees = [],
}: ImportTemplateOptions): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SEMTOP Marketing CRM";
  workbook.created = new Date();

  const activeAttrs = attrFields.filter((f) => f.active);
  const hasCustomEmail = activeAttrs.some((f) => f.key.toLowerCase() === "email");
  const { labels } = catalog;

  const sheet = workbook.addWorksheet("Nhập lead");

  const fixedCols: { header: string; key: string; width: number }[] = [
    { header: "Họ tên *", key: "name", width: 24 },
    { header: "Số điện thoại *", key: "phone", width: 18 },
    ...(hasCustomEmail ? [] : [{ header: "Email", key: "email", width: 26 }]),
    { header: labels.brand, key: "brand", width: 18 },
    { header: labels.product, key: "product", width: 22 },
    { header: labels.location, key: "location", width: 22 },
    { header: "Chi tiết kênh", key: "channelDetail", width: 18 },
    { header: "Phân loại", key: "category", width: 18 },
    { header: "Lý do loại", key: "failReason", width: 22 },
    { header: "Phụ trách", key: "assignee", width: 22 },
    { header: "Hẹn gọi lại (yyyy-MM-dd)", key: "callbackAt", width: 24 },
    { header: "Nội dung chăm sóc", key: "careNote", width: 32 },
  ];

  const customCols = activeAttrs.map((field) => ({
    header: field.required ? `${field.label} *` : field.label,
    key: `attr:${field.key}`,
    width: 24,
  }));

  sheet.columns = [...fixedCols, ...customCols];

  // Định dạng cột SĐT là Text để Excel giữ số 0 ở đầu.
  const phoneCol = sheet.getColumn("phone");
  phoneCol.numFmt = "@";

  const firstBrand = catalog.brands[0]?.code ?? null;
  const firstBrandName = catalog.brands[0]?.name ?? "";
  const firstProduct = (firstBrand ? catalog.productsByBrand[firstBrand]?.[0] : undefined) ?? "";
  const firstLocation = catalog.locations[0] ?? "";

  const sampleRowData: Record<string, string> = {
    name: "Nguyễn Văn Mẫu",
    phone: "0901234567",
    email: "khachhang.mau@example.com",
    brand: firstBrandName,
    product: firstProduct,
    location: firstLocation,
    channelDetail: CHANNEL_DETAIL_OPTIONS[1]?.label ?? "Form",
    category: CATEGORY_OPTIONS[0]?.label ?? "Chưa phân loại",
    failReason: "",
    assignee: assignees[0] ?? "",
    callbackAt: "2026-10-25",
    careNote: "Khách quan tâm cần tư vấn báo giá",
  };

  for (const field of activeAttrs) {
    sampleRowData[`attr:${field.key}`] = sampleValueForAttrField(field);
  }

  sheet.addRow(sampleRowData);

  const headerRow = sheet.getRow(1);
  headerRow.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  headerRow.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  headerRow.alignment = { vertical: "middle" };
  headerRow.height = 24;
  sheet.views = [{ state: "frozen", ySplit: 1 }];

  // Sheet 2: Hướng dẫn & Danh mục hợp lệ
  const guide = workbook.addWorksheet("Hướng dẫn & Danh mục");
  guide.columns = [
    { header: "Trường thông tin", key: "field", width: 28 },
    { header: "Kiểu dữ liệu", key: "type", width: 32 },
    { header: "Bắt buộc", key: "required", width: 14 },
    { header: "Giá trị hợp lệ / Ghi chú", key: "options", width: 65 },
  ];

  const guideRows: { field: string; type: string; required: string; options: string }[] = [
    {
      field: "Họ tên *",
      type: "Văn bản (tối đa 120 ký tự)",
      required: "Có",
      options: "Tên khách hàng",
    },
    {
      field: "Số điện thoại *",
      type: "Số điện thoại (9–15 chữ số, không trùng)",
      required: "Có (Unique)",
      options: "Ví dụ: 0901234567 hoặc +84901234567. Nếu trùng SĐT đã có thì dòng đó không được import.",
    },
    ...(hasCustomEmail
      ? []
      : [
          {
            field: "Email",
            type: "Email (không trùng nếu có nhập)",
            required: "Không (Unique)",
            options: "Ví dụ: ten@congty.vn. Nếu trùng email đã có thì dòng đó không được import.",
          },
        ]),
    {
      field: labels.brand,
      type: "Danh mục",
      required: "Không",
      options: catalog.brands.map((b) => `${b.name} (${b.code})`).join(", ") || "Chưa cấu hình",
    },
    {
      field: labels.product,
      type: "Danh mục",
      required: "Không",
      options: Object.values(catalog.productsByBrand).flat().join(", ") || "Chưa cấu hình",
    },
    {
      field: labels.location,
      type: "Danh mục",
      required: "Không",
      options: catalog.locations.join(", ") || "Chưa cấu hình",
    },
    {
      field: "Chi tiết kênh",
      type: "Danh sách (chọn 1)",
      required: "Không",
      options: CHANNEL_DETAIL_OPTIONS.map((o) => o.label).join(", "),
    },
    {
      field: "Phân loại",
      type: "Danh sách (chọn 1)",
      required: "Không",
      options: CATEGORY_OPTIONS.map((o) => o.label).join(", "),
    },
    {
      field: "Lý do loại",
      type: "Danh sách (chọn 1)",
      required: "Không",
      options: FAIL_REASON_OPTIONS.map((o) => o.label).join(", "),
    },
    {
      field: "Phụ trách",
      type: "Nhân viên",
      required: "Không",
      options:
        assignees.length > 0
          ? `Nếu tài khoản Staff import sẽ tự gán cho chính mình; Admin mặc định Chưa giao hoặc chọn: ${assignees.join(", ")}`
          : "Nếu tài khoản Staff import sẽ tự gán cho chính mình; Admin mặc định Chưa giao",
    },
    {
      field: "Hẹn gọi lại (yyyy-MM-dd)",
      type: "Ngày tháng",
      required: "Không",
      options: "Định dạng yyyy-MM-dd (vd: 2026-10-25) hoặc dd/MM/yyyy (vd: 25/10/2026)",
    },
    {
      field: "Nội dung chăm sóc",
      type: "Văn bản",
      required: "Không",
      options: "Ghi chú ban đầu cho khách hàng",
    },
    ...activeAttrs.map((field) => ({
      field: field.required ? `${field.label} *` : field.label,
      type: FIELD_TYPE_VI[field.fieldType] ?? field.fieldType,
      required: field.required ? "Có" : "Không",
      options:
        field.fieldType === "select" || field.fieldType === "multiselect"
          ? field.options.join(", ")
          : field.fieldType === "boolean"
            ? "Có / Không (hoặc true / false)"
            : "",
    })),
  ];

  for (const row of guideRows) {
    guide.addRow(row);
  }

  const guideHeader = guide.getRow(1);
  guideHeader.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  guideHeader.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  guideHeader.height = 24;
  guide.views = [{ state: "frozen", ySplit: 1 }];

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

function normalizeHeader(raw: string): string {
  return raw
    .replace(/\*+$/g, "")
    .replace(/\(.*?\)/g, "")
    .trim()
    .toLowerCase();
}

function extractCellString(value: ExcelJS.CellValue, isPhoneCol = false): string {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return "";
    const vnDate = new Date(value.getTime() + 7 * 3600_000);
    const yyyy = vnDate.getUTCFullYear();
    if (yyyy < 1900 || yyyy > 2100) return "";
    const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(vnDate.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof value === "number") {
    const str = String(value);
    // Khi nhập SĐT vào ô General của Excel, số 0 đầu có thể bị mất (vd 901234567 → 0901234567).
    if (isPhoneCol && /^\d{9}$/.test(str) && !str.startsWith("0")) {
      return `0${str}`;
    }
    return str;
  }
  if (typeof value === "boolean") {
    return value ? "true" : "false";
  }
  if (typeof value === "object") {
    if ("text" in value && typeof value.text === "string") return value.text.trim();
    if ("result" in value && value.result !== undefined && value.result !== null) {
      return extractCellString(value.result as ExcelJS.CellValue, isPhoneCol);
    }
    if ("richText" in value && Array.isArray(value.richText)) {
      return value.richText.map((part) => part.text).join("").trim();
    }
  }
  return String(value).trim();
}

function isValidCalendarDate(y: number, m: number, day: number): boolean {
  if (m < 1 || m > 12 || day < 1 || day > 31) return false;
  const d = new Date(Date.UTC(y, m - 1, day));
  return (
    !Number.isNaN(d.getTime()) &&
    d.getUTCFullYear() === y &&
    d.getUTCMonth() + 1 === m &&
    d.getUTCDate() === day
  );
}

function parseDateValue(raw: string): string | null {
  const value = raw.trim();
  if (!value) return null;
  const mIso = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (mIso) {
    const y = Number(mIso[1]);
    const m = Number(mIso[2]);
    const day = Number(mIso[3]);
    return isValidCalendarDate(y, m, day) ? value : null;
  }
  const mVn = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value);
  if (mVn) {
    const day = Number(mVn[1]);
    const m = Number(mVn[2]);
    const y = Number(mVn[3]);
    if (!isValidCalendarDate(y, m, day)) return null;
    const dd = String(day).padStart(2, "0");
    const mm = String(m).padStart(2, "0");
    const yyyy = String(y);
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

function validateCustomField(def: AttrFieldRow, raw: string): { ok: true; value: string } | { ok: false; error: string } {
  const value = raw.trim();
  if (!value) {
    if (def.required) return { ok: false, error: `Trường bắt buộc` };
    return { ok: true, value: "" };
  }
  if (def.fieldType === "number") {
    if (Number.isNaN(Number(value))) {
      return { ok: false, error: "Phải là số" };
    }
    return { ok: true, value };
  }
  if (def.fieldType === "date") {
    const parsed = parseDateValue(value);
    if (!parsed) {
      return { ok: false, error: "Sai định dạng ngày (yyyy-MM-dd hoặc dd/MM/yyyy)" };
    }
    return { ok: true, value: parsed };
  }
  if (def.fieldType === "boolean") {
    const lower = value.toLowerCase();
    if (lower === "true" || lower === "1" || lower === "có" || lower === "co" || lower === "yes") {
      return { ok: true, value: "true" };
    }
    if (lower === "false" || lower === "0" || lower === "không" || lower === "khong" || lower === "no") {
      return { ok: true, value: "false" };
    }
    return { ok: false, error: "Chỉ nhận Có / Không" };
  }
  if (def.fieldType === "select") {
    const matched = def.options.find((o) => o.toLowerCase() === value.toLowerCase());
    if (!matched) {
      return { ok: false, error: `Không nằm trong danh sách (${def.options.join(", ")})` };
    }
    return { ok: true, value: matched };
  }
  if (def.fieldType === "multiselect") {
    const items = value
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);
    if (items.length === 0) {
      if (def.required) return { ok: false, error: "Trường bắt buộc" };
      return { ok: true, value: "" };
    }
    const resolved: string[] = [];
    const bad: string[] = [];
    for (const item of items) {
      const matched = def.options.find((o) => o.toLowerCase() === item.toLowerCase());
      if (matched) resolved.push(matched);
      else bad.push(item);
    }
    if (bad.length > 0) {
      return { ok: false, error: `Giá trị không hợp lệ: ${bad.join(", ")}` };
    }
    return { ok: true, value: resolved.join(", ") };
  }
  return { ok: true, value };
}

type ColumnTarget =
  | { kind: "ignore" }
  | { kind: "fixed"; id: "name" | "phone" | "email" | "brand" | "product" | "location" | "channelDetail" | "category" | "failReason" | "assignee" | "callbackAt" | "careNote" }
  | { kind: "attr"; def: AttrFieldRow }
  | { kind: "unknown"; header: string };

const HEADER_DETECT_ANCHORS = new Set([
  "số điện thoại",
  "so dien thoai",
  "sđt",
  "sdt",
  "phone",
  "họ tên",
  "ho ten",
  "tên khách hàng",
  "ten khach hang",
]);

function findHeaderRowIndex(sheet: ExcelJS.Worksheet): number {
  const maxScan = Math.min(10, sheet.rowCount);
  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    let matchedAnchor = false;
    row.eachCell({ includeEmpty: false }, (cell) => {
      const norm = normalizeHeader(extractCellString(cell.value));
      if (HEADER_DETECT_ANCHORS.has(norm)) {
        matchedAnchor = true;
      }
    });
    if (matchedAnchor) return r;
  }
  return 1;
}

/**
 * Đọc và kiểm tra toàn bộ dữ liệu từ file Excel (.xlsx) được upload.
 *
 * Quy tắc:
 * - Kiểm tra trùng SĐT & Email với dữ liệu đã có trong DB và giữa các dòng trong cùng file.
 * - Nếu SĐT trống/sai định dạng hoặc trùng SĐT / trùng Email (các trường unique) → chặn không cho import dòng đó (`canImport = false`).
 * - Với các trường khác (brand, product, location, ngày tháng, field phụ...): phân loại rõ trường nào hợp lệ (`validFields`), trường nào không hợp lệ (`invalidFields`).
 *   Nếu dòng có trường hợp lệ và không vi phạm SĐT/Email unique thì vẫn cho phép import các trường hợp lệ (`canImport = true`).
 */
export async function parseAndValidateImportWorkbook(
  buffer: ArrayBuffer | Buffer,
  context: ImportValidationContext,
): Promise<ImportValidationReport> {
  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  await workbook.xlsx.load(nodeBuffer as unknown as ExcelJS.Buffer);

  const sheet = workbook.worksheets[0];
  if (!sheet) {
    return {
      totalRows: 0,
      importableCount: 0,
      fullyValidCount: 0,
      partialValidCount: 0,
      blockedCount: 0,
      duplicateCount: 0,
      unrecognizedColumns: [],
      rows: [],
    };
  }

  const activeAttrs = context.attrFields.filter((f) => f.active);
  const { labels } = context.catalog;

  const headerRowIndex = findHeaderRowIndex(sheet);
  const headerRow = sheet.getRow(headerRowIndex);
  const columnMap = new Map<number, ColumnTarget>();
  const unrecognizedColumns: string[] = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const rawHeader = extractCellString(cell.value);
    if (!rawHeader) return;
    const norm = normalizeHeader(rawHeader);

    if (["stt", "số thứ tự", "so thu tu", "no", "#"].includes(norm)) {
      columnMap.set(colNumber, { kind: "ignore" });
      return;
    }
    if (["họ tên", "ho ten", "khách hàng", "khach hang", "tên khách hàng", "ten khach hang", "name"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "name" });
      return;
    }
    if (["số điện thoại", "so dien thoai", "sđt", "sdt", "điện thoại", "dien thoai", "phone"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "phone" });
      return;
    }
    if (["email", "e-mail", "thư điện tử", "thu dien tu"].includes(norm)) {
      const customEmail = activeAttrs.find((f) => f.key.toLowerCase() === "email");
      if (customEmail) {
        columnMap.set(colNumber, { kind: "attr", def: customEmail });
      } else {
        columnMap.set(colNumber, { kind: "fixed", id: "email" });
      }
      return;
    }
    if ([normalizeHeader(labels.brand), "thương hiệu", "thuong hieu", "hãng", "hang", "brand"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "brand" });
      return;
    }
    if (
      [
        normalizeHeader(labels.product),
        "dòng xe",
        "dong xe",
        "loại xe",
        "loai xe",
        "mẫu xe",
        "mau xe",
        "sản phẩm",
        "san pham",
        "product",
      ].includes(norm)
    ) {
      columnMap.set(colNumber, { kind: "fixed", id: "product" });
      return;
    }
    if (
      [
        normalizeHeader(labels.location),
        "đại lý",
        "dai ly",
        "tên đại lý",
        "ten dai ly",
        "showroom",
        "chi nhánh",
        "chi nhanh",
        "địa điểm",
        "dia diem",
        "location",
      ].includes(norm)
    ) {
      columnMap.set(colNumber, { kind: "fixed", id: "location" });
      return;
    }
    if (["chi tiết kênh", "chi tiet kenh", "kênh", "channel"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "channelDetail" });
      return;
    }
    if (["phân loại", "phan loai", "category"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "category" });
      return;
    }
    if (["lý do loại", "ly do loai", "fail reason"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "failReason" });
      return;
    }
    if (["phụ trách", "phu trach", "nhân viên phụ trách", "assignee"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "assignee" });
      return;
    }
    if (["hẹn gọi lại", "hen goi lai", "callback"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "callbackAt" });
      return;
    }
    if (["nội dung chăm sóc", "noi dung cham soc", "ghi chú", "ghi chu", "care note"].includes(norm)) {
      columnMap.set(colNumber, { kind: "fixed", id: "careNote" });
      return;
    }

    const matchedAttr = activeAttrs.find(
      (f) =>
        normalizeHeader(f.label) === norm ||
        f.key.toLowerCase() === norm ||
        `attr:${f.key.toLowerCase()}` === norm,
    );
    if (matchedAttr) {
      columnMap.set(colNumber, { kind: "attr", def: matchedAttr });
      return;
    }

    columnMap.set(colNumber, { kind: "unknown", header: rawHeader });
    unrecognizedColumns.push(rawHeader);
  });

  // Bản đồ tra cứu trùng SĐT và Email trong DB
  const existingPhoneMap = new Map<string, { name: string | null; phone: string }>();
  const existingEmailMap = new Map<string, { name: string | null; email: string }>();
  for (const item of context.existingLeads) {
    const pKey = phoneKey(item.phone);
    if (pKey) existingPhoneMap.set(pKey, { name: item.name, phone: item.phone });
    const eKey = item.email?.trim().toLowerCase();
    if (eKey) existingEmailMap.set(eKey, { name: item.name, email: item.email! });
  }

  // Bản đồ tra cứu trùng ngay trong file đang upload
  const seenPhonesInFile = new Map<string, number>();
  const seenEmailsInFile = new Map<string, number>();

  const validatedRows: ValidatedImportRow[] = [];

  for (let r = headerRowIndex + 1; r <= sheet.rowCount; r++) {
    const row = sheet.getRow(r);
    const fixedValues: Record<string, string> = {};
    const attrRawValues: Record<string, string> = {};
    const unknownRowCols: { header: string; value: string }[] = [];
    let hasAnyValue = false;

    for (const [colNumber, target] of columnMap.entries()) {
      if (target.kind === "ignore") continue;
      const isPhone = target.kind === "fixed" && target.id === "phone";
      const val = extractCellString(row.getCell(colNumber).value, isPhone);
      if (val !== "") hasAnyValue = true;
      if (target.kind === "fixed") {
        fixedValues[target.id] = val;
      } else if (target.kind === "attr") {
        attrRawValues[target.def.key] = val;
      } else if (val !== "") {
        unknownRowCols.push({ header: target.header, value: val });
      }
    }

    if (!hasAnyValue) continue;

    const validFields: FieldValidationSuccess[] = [];
    const invalidFields: FieldValidationError[] = [];
    let blockingError: string | null = null;
    let isDuplicate = false;

    // 1. Kiểm tra Họ tên
    const rawName = (fixedValues.name ?? "").trim();
    let validName = "";
    if (!rawName) {
      const msg = "Họ tên đang để trống";
      invalidFields.push({ field: "Họ tên", value: "(trống)", error: msg });
      blockingError = blockingError ?? msg;
    } else if (rawName.length > 250) {
      const msg = "Tối đa 250 ký tự";
      invalidFields.push({ field: "Họ tên", value: `${rawName.slice(0, 25)}…`, error: msg });
      blockingError = blockingError ?? msg;
    } else {
      validName = rawName;
      validFields.push({ field: "Họ tên", value: validName });
    }

    // 2. Kiểm tra Số điện thoại (Bắt buộc & Unique)
    const rawPhone = (fixedValues.phone ?? "").trim();
    const phoneErr = validatePhone(rawPhone);
    const normalizedPhone = normalizePhone(rawPhone);
    if (phoneErr) {
      invalidFields.push({ field: "Số điện thoại", value: rawPhone || "(trống)", error: phoneErr });
      blockingError = phoneErr;
    } else {
      const pKey = phoneKey(normalizedPhone);
      const dupDb = existingPhoneMap.get(pKey);
      const dupFileRow = seenPhonesInFile.get(pKey);
      if (dupDb) {
        isDuplicate = true;
        const msg = `Trùng SĐT với lead «${dupDb.name?.trim() || "Khách chưa có tên"}» trong hệ thống`;
        invalidFields.push({ field: "Số điện thoại", value: normalizedPhone, error: msg });
        blockingError = msg;
      } else if (dupFileRow !== undefined) {
        isDuplicate = true;
        const msg = `Trùng SĐT với dòng ${dupFileRow} trong cùng file`;
        invalidFields.push({ field: "Số điện thoại", value: normalizedPhone, error: msg });
        blockingError = msg;
      } else {
        seenPhonesInFile.set(pKey, r);
        validFields.push({ field: "Số điện thoại", value: normalizedPhone });
      }
    }

    // 3. Kiểm tra Email (Unique nếu có nhập)
    const rawEmail = (fixedValues.email ?? attrRawValues.email ?? "").trim();
    let validEmail: string | null = null;
    if (rawEmail) {
      if (!EMAIL_RE.test(rawEmail)) {
        const msg = "Email không đúng định dạng";
        invalidFields.push({ field: "Email", value: rawEmail, error: msg });
      } else {
        const eKey = rawEmail.toLowerCase();
        const dupEmailDb = existingEmailMap.get(eKey);
        const dupEmailFile = seenEmailsInFile.get(eKey);
        if (dupEmailDb) {
          isDuplicate = true;
          const msg = `Trùng email với lead «${dupEmailDb.name?.trim() || "Khách chưa có tên"}» trong hệ thống`;
          invalidFields.push({ field: "Email", value: rawEmail, error: msg });
          blockingError = blockingError ?? msg;
        } else if (dupEmailFile !== undefined) {
          isDuplicate = true;
          const msg = `Trùng email với dòng ${dupEmailFile} trong cùng file`;
          invalidFields.push({ field: "Email", value: rawEmail, error: msg });
          blockingError = blockingError ?? msg;
        } else {
          seenEmailsInFile.set(eKey, r);
          validEmail = rawEmail;
          validFields.push({ field: "Email", value: rawEmail });
        }
      }
    }

    // 4. Kiểm tra Thương hiệu (Brand)
    const rawBrand = (fixedValues.brand ?? "").trim();
    let validBrand: BrandCode | null = null;
    if (rawBrand) {
      const matchedBrand = context.catalog.brands.find(
        (b) =>
          b.code.toLowerCase() === rawBrand.toLowerCase() ||
          b.name.toLowerCase() === rawBrand.toLowerCase(),
      );
      if (matchedBrand) {
        validBrand = matchedBrand.code;
        validFields.push({ field: labels.brand, value: matchedBrand.name });
      } else {
        invalidFields.push({
          field: labels.brand,
          value: rawBrand,
          error: `Không thuộc danh mục ${labels.brand}`,
        });
      }
    }

    // 5. Kiểm tra Sản phẩm (Product)
    const rawProduct = (fixedValues.product ?? "").trim();
    let validProduct: string | null = null;
    if (rawProduct) {
      const candidateProducts = validBrand
        ? (context.catalog.productsByBrand[validBrand] ?? [])
        : Object.values(context.catalog.productsByBrand).flat();
      const matchedProd = candidateProducts.find((p) => p.toLowerCase() === rawProduct.toLowerCase());
      if (matchedProd) {
        validProduct = matchedProd;
        validFields.push({ field: labels.product, value: matchedProd });
        // Nếu chưa điền brand nhưng điền đúng sản phẩm thì tự suy ra brand tương ứng
        if (!validBrand) {
          for (const [bCode, prods] of Object.entries(context.catalog.productsByBrand)) {
            if (prods.includes(matchedProd)) {
              validBrand = bCode;
              break;
            }
          }
        }
      } else {
        invalidFields.push({
          field: labels.product,
          value: rawProduct,
          error: `Không thuộc danh mục ${labels.product}`,
        });
      }
    }

    // 6. Kiểm tra Địa điểm / Đại lý (Location)
    const rawLocation = (fixedValues.location ?? "").trim();
    let validLocation: string | null = null;
    if (rawLocation) {
      const matchedLoc = context.catalog.locations.find(
        (l) => l.toLowerCase() === rawLocation.toLowerCase(),
      );
      if (matchedLoc) {
        validLocation = matchedLoc;
        validFields.push({ field: labels.location, value: matchedLoc });
      } else {
        invalidFields.push({
          field: labels.location,
          value: rawLocation,
          error: `Không thuộc danh mục ${labels.location}`,
        });
      }
    }

    // 7. Chi tiết kênh (ChannelDetail)
    const rawChannel = (fixedValues.channelDetail ?? "").trim();
    let validChannel: ChannelDetail = "FORM";
    if (rawChannel) {
      const matchedChannel = CHANNEL_DETAIL_OPTIONS.find(
        (o) =>
          o.value.toLowerCase() === rawChannel.toLowerCase() ||
          o.label.toLowerCase() === rawChannel.toLowerCase(),
      );
      if (matchedChannel) {
        validChannel = matchedChannel.value;
        validFields.push({ field: "Chi tiết kênh", value: matchedChannel.label });
      } else {
        invalidFields.push({
          field: "Chi tiết kênh",
          value: rawChannel,
          error: `Chi tiết kênh không hợp lệ (${CHANNEL_DETAIL_OPTIONS.map((o) => o.label).join(", ")})`,
        });
      }
    }

    // 8. Phân loại (Category) & Lý do loại (FailReason)
    const rawCategory = (fixedValues.category ?? "").trim();
    let validCategory: LeadCategory = "CHUA_PHAN_LOAI";
    if (rawCategory) {
      const lowerCat = rawCategory.toLowerCase();
      if (lowerCat === "chưa phân loại" || lowerCat === "chua phan loai" || lowerCat === "chua_phan_loai") {
        validCategory = "CHUA_PHAN_LOAI";
        validFields.push({ field: "Phân loại", value: "Chưa phân loại" });
      } else {
        const matchedCat = CATEGORY_OPTIONS.find(
          (o) =>
            o.value.toLowerCase() === lowerCat ||
            o.label.toLowerCase() === lowerCat ||
            (o.hint && o.hint.toLowerCase() === lowerCat),
        );
        if (matchedCat) {
          validCategory = matchedCat.value;
          validFields.push({ field: "Phân loại", value: matchedCat.label });
        } else {
          invalidFields.push({
            field: "Phân loại",
            value: rawCategory,
            error: "Phân loại không hợp lệ",
          });
        }
      }
    }

    const rawFailReason = (fixedValues.failReason ?? "").trim();
    let validFailReason: FailReason | null = null;
    if (rawFailReason) {
      const matchedReason = FAIL_REASON_OPTIONS.find(
        (o) =>
          o.value.toLowerCase() === rawFailReason.toLowerCase() ||
          o.label.toLowerCase() === rawFailReason.toLowerCase(),
      );
      if (matchedReason) {
        validFailReason = matchedReason.value;
        validFields.push({ field: "Lý do loại", value: matchedReason.label });
      } else {
        invalidFields.push({
          field: "Lý do loại",
          value: rawFailReason,
          error: "Lý do loại không hợp lệ",
        });
      }
    }

    // 9. Phụ trách (Assignee) — tuân theo quy tắc vai trò
    const rawAssignee = (fixedValues.assignee ?? "").trim();
    let validAssignee: string | null = null;
    if (context.viewer.role === "STAFF") {
      validAssignee = context.viewer.fullName ?? null;
      validFields.push({
        field: "Phụ trách",
        value: context.viewer.fullName || "Tài khoản hiện tại (Staff)",
      });
    } else if (rawAssignee) {
      const matchedAssignee = context.assignees.find(
        (a) => a.toLowerCase() === rawAssignee.toLowerCase(),
      );
      if (matchedAssignee) {
        validAssignee = matchedAssignee;
        validFields.push({ field: "Phụ trách", value: matchedAssignee });
      } else {
        invalidFields.push({
          field: "Phụ trách",
          value: rawAssignee,
          error: "Nhân viên phụ trách không tồn tại (sẽ để mặc định Chưa giao)",
        });
      }
    }

    // 10. Hẹn gọi lại (callbackAt)
    const rawCallback = (fixedValues.callbackAt ?? "").trim();
    let validCallbackAt: string | null = null;
    if (rawCallback) {
      const parsedDate = parseDateValue(rawCallback);
      if (parsedDate) {
        validCallbackAt = parsedDate;
        validFields.push({ field: "Hẹn gọi lại", value: parsedDate });
      } else {
        invalidFields.push({
          field: "Hẹn gọi lại",
          value: rawCallback,
          error: "Sai định dạng ngày (yyyy-MM-dd hoặc dd/MM/yyyy)",
        });
      }
    }

    // 11. Nội dung chăm sóc (careNote)
    const rawNote = (fixedValues.careNote ?? "").trim();
    let validCareNote: string | null = null;
    if (rawNote) {
      validCareNote = rawNote;
      validFields.push({ field: "Nội dung chăm sóc", value: rawNote });
    }

    // 12. Kiểm tra các field phụ cấu hình thêm (attrFields)
    const validAttrs: Record<string, string> = {};
    if (validEmail) validAttrs.email = validEmail;

    for (const def of activeAttrs) {
      if (def.key.toLowerCase() === "email") continue;
      const cellVal = attrRawValues[def.key] ?? "";
      if (!cellVal.trim() && !def.required) continue;

      const check = validateCustomField(def, cellVal);
      if (check.ok) {
        if (check.value) {
          validAttrs[def.key] = check.value;
          validFields.push({
            field: def.label,
            value:
              def.fieldType === "boolean"
                ? check.value === "true"
                  ? "Có"
                  : "Không"
                : check.value,
          });
        }
      } else {
        invalidFields.push({
          field: def.label,
          value: cellVal || "(trống)",
          error: check.error,
        });
        if (def.required) {
          blockingError = blockingError ?? `${def.label}: ${check.error}`;
        }
      }
    }

    for (const unk of unknownRowCols) {
      invalidFields.push({
        field: unk.header,
        value: unk.value,
        error: "Cột không tồn tại trong cấu hình dự án",
      });
    }

    const canImport = blockingError === null && validFields.length > 0;
    const status: ImportRowStatus = !canImport
      ? "blocked"
      : invalidFields.length > 0
        ? "partial"
        : "valid";

    const payload: CreateManualLeadInput | null = canImport
      ? {
          name: validName || "Khách chưa có tên",
          phone: normalizedPhone,
          email: validEmail,
          brand: validBrand,
          product: validProduct,
          location: validLocation,
          channelDetail: validChannel,
          category: validCategory,
          failReason: validCategory === "FAIL" ? validFailReason : null,
          assignee: validAssignee,
          careNote: validCareNote,
          callbackAt: validCallbackAt,
          attrs: validAttrs,
        }
      : null;

    validatedRows.push({
      rowNumber: r,
      name: validName || rawName,
      phone: normalizedPhone || rawPhone,
      email: validEmail ?? rawEmail,
      status,
      canImport,
      isDuplicate,
      blockingError,
      validFields,
      invalidFields,
      payload,
    });
  }

  const fullyValidCount = validatedRows.filter((r) => r.status === "valid").length;
  const partialValidCount = validatedRows.filter((r) => r.status === "partial").length;
  const blockedCount = validatedRows.filter((r) => r.status === "blocked").length;
  const duplicateCount = validatedRows.filter((r) => r.isDuplicate).length;
  const importableCount = fullyValidCount + partialValidCount;

  return {
    totalRows: validatedRows.length,
    importableCount,
    fullyValidCount,
    partialValidCount,
    blockedCount,
    duplicateCount,
    unrecognizedColumns,
    rows: validatedRows,
  };
}
