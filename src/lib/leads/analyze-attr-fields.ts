import { generateText } from "ai";
import ExcelJS from "exceljs";

import { resolveModelCandidates } from "@/lib/ai/model";
import type { AttrFieldRow, AttrFieldType } from "@/lib/db/attr-fields-repo";
import type { CatalogLabels } from "@/lib/types";
import { DEFAULT_CATALOG_LABELS } from "@/lib/constants";

export type AnalyzedColumnStatus = "suggested" | "existing" | "core";

export interface AnalyzedAttrColumn {
  columnIndex: number;
  rawHeader: string;
  label: string;
  key: string;
  fieldType: AttrFieldType;
  options: string[];
  required: boolean;
  status: AnalyzedColumnStatus;
  statusNote: string;
  sampleValues: string[];
  nonEmptyCount: number;
}

export interface AnalyzeAttrFieldsReport {
  headerRowIndex: number;
  totalRowsScanned: number;
  mode: "ai" | "heuristic";
  columns: AnalyzedAttrColumn[];
}

function removeAccents(str: string): string {
  return str
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D");
}

export function slugifyAttrKey(raw: string): string {
  return removeAccents(raw)
    .trim()
    .toLowerCase()
    .replace(/\(.*?\)/g, "")
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function normalizeHeader(raw: string): string {
  return raw
    .trim()
    .replace(/\*+$/g, "")
    .replace(/\(.*?\)/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

const PRESERVE_ACRONYMS = new Set([
  "CCCD",
  "CMND",
  "VIN",
  "MST",
  "STK",
  "VAT",
  "VIP",
  "ID",
  "OTP",
  "URL",
  "KOC",
  "KOL",
  "TVBH",
  "SR",
  "HĐ",
  "HĐMB",
  "SDT",
  "SĐT",
]);

/**
 * Chuẩn hóa tiêu đề viết HOA toàn bộ (VD: "MÃ ĐẠI LÝ", "SỐ CCCD", "MÃ SỐ THUẾ (CÔNG TY)")
 * thành nhãn hiển thị đẹp (VD: "Mã đại lý", "Số CCCD", "Mã số thuế (Công ty)").
 */
export function formatPrettyLabel(rawHeader: string): string {
  const cleaned = rawHeader.trim().replace(/\*+$/g, "").replace(/\s+/g, " ");
  if (!cleaned) return "";

  // Nếu không phải in hoa toàn bộ thì giữ nguyên
  if (cleaned !== cleaned.toUpperCase()) {
    return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
  }

  const words = cleaned.split(" ");
  return words
    .map((word, index) => {
      const bare = word.replace(/^[([{]+|[)\]}.,:;]+$/g, "");
      if (PRESERVE_ACRONYMS.has(bare.toUpperCase())) {
        return word;
      }
      const lower = word.toLowerCase();
      if (index === 0) {
        return lower.charAt(0).toUpperCase() + lower.slice(1);
      }
      if (lower.startsWith("(") && lower.length > 1) {
        return "(" + lower.charAt(1).toUpperCase() + lower.slice(2);
      }
      return lower;
    })
    .join(" ");
}

function extractCellString(cell: ExcelJS.Cell | undefined): string {
  if (!cell || cell.value === null || cell.value === undefined) return "";
  const val = cell.value;
  if (typeof val === "string") return val.trim();
  if (typeof val === "number") return String(val);
  if (typeof val === "boolean") return val ? "Có" : "Không";
  if (val instanceof Date) {
    if (Number.isNaN(val.getTime())) return "";
    const vnMs = val.getTime() + 7 * 3600_000;
    const vnDate = new Date(vnMs);
    const yyyy = vnDate.getUTCFullYear();
    if (yyyy < 1900 || yyyy > 2100) return "";
    const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
    const dd = String(vnDate.getUTCDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  }
  if (typeof val === "object") {
    if ("text" in val && typeof val.text === "string") return val.text.trim();
    if ("result" in val && val.result !== undefined && val.result !== null) {
      if (val.result instanceof Date) {
        const vnMs = val.result.getTime() + 7 * 3600_000;
        const vnDate = new Date(vnMs);
        const yyyy = vnDate.getUTCFullYear();
        if (yyyy < 1900 || yyyy > 2100) return "";
        const mm = String(vnDate.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(vnDate.getUTCDate()).padStart(2, "0");
        return `${yyyy}-${mm}-${dd}`;
      }
      return String(val.result).trim();
    }
    if ("richText" in val && Array.isArray(val.richText)) {
      return val.richText.map((part) => part.text ?? "").join("").trim();
    }
  }
  return String(val).trim();
}

const HEADER_CANDIDATE_TOKENS = new Set([
  "họ tên",
  "ho ten",
  "tên khách hàng",
  "ten khach hang",
  "khách hàng",
  "khach hang",
  "name",
  "full name",
  "số điện thoại",
  "so dien thoai",
  "sđt",
  "sdt",
  "điện thoại",
  "dien thoai",
  "phone",
]);

function findHeaderRowIndex(sheet: ExcelJS.Worksheet): number {
  const maxScan = Math.min(10, sheet.rowCount);
  let bestRow = 1;
  let bestScore = -1;

  for (let r = 1; r <= maxScan; r++) {
    const row = sheet.getRow(r);
    let score = 0;
    let nonEmpty = 0;
    const seen = new Set<string>();
    row.eachCell({ includeEmpty: false }, (cell) => {
      const norm = normalizeHeader(extractCellString(cell));
      if (!norm) return;
      nonEmpty++;
      seen.add(norm);
      if (HEADER_CANDIDATE_TOKENS.has(norm)) score += 10;
    });
    if (nonEmpty > 0) {
      score += seen.size;
    }
    if (score > bestScore) {
      bestScore = score;
      bestRow = r;
    }
  }
  return bestRow;
}

function matchCoreOrCatalogField(
  normHeader: string,
  labels: CatalogLabels,
): string | null {
  if (["stt", "số thứ tự", "so thu tu", "no", "no.", "#"].includes(normHeader)) {
    return "Cột số thứ tự (tự động bỏ qua khi import)";
  }
  if (
    [
      "họ tên",
      "ho ten",
      "tên khách hàng",
      "ten khach hang",
      "khách hàng",
      "khach hang",
      "họ và tên",
      "ho va ten",
      "name",
      "full name",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Họ tên khách hàng";
  }
  if (
    [
      "số điện thoại",
      "so dien thoai",
      "sđt",
      "sdt",
      "điện thoại",
      "dien thoai",
      "phone",
      "mobile",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Số điện thoại";
  }
  if (["email", "e-mail", "thư điện tử", "thu dien tu"].includes(normHeader)) {
    return "Trường mặc định: Email";
  }
  if (
    [
      "ghi chú",
      "ghi chu",
      "ghi chú chăm sóc",
      "ghi chu cham soc",
      "note",
      "notes",
      "care note",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Ghi chú chăm sóc";
  }
  if (
    [
      "phụ trách",
      "phu trach",
      "nhân viên phụ trách",
      "nhan vien phu trach",
      "sale",
      "assignee",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Nhân viên phụ trách";
  }
  if (
    [
      "hẹn gọi lại",
      "hen goi lai",
      "ngày hẹn gọi lại",
      "ngay hen goi lai",
      "callback",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Hẹn gọi lại";
  }
  if (
    [
      "phân loại",
      "phan loai",
      "nhóm khách",
      "nhom khach",
      "category",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Phân loại Lead";
  }
  if (
    [
      "trạng thái liên hệ",
      "trang thai lien he",
      "tình trạng liên hệ",
      "contact status",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Trạng thái liên hệ";
  }
  if (
    [
      "kênh chi tiết",
      "kenh chi tiet",
      "kênh liên hệ",
      "channel",
    ].includes(normHeader)
  ) {
    return "Trường mặc định: Kênh chi tiết";
  }
  if (
    [
      normalizeHeader(labels.brand),
      "thương hiệu",
      "thuong hieu",
      "hãng",
      "hang",
      "brand",
    ].includes(normHeader)
  ) {
    return `Danh mục cố định: ${labels.brand}`;
  }
  if (
    [
      normalizeHeader(labels.product),
      "loại sản phẩm",
      "loai san pham",
      "sản phẩm",
      "san pham",
      "dòng xe",
      "dong xe",
      "mẫu xe",
      "mau xe",
      "loại xe",
      "loai xe",
      "product",
    ].includes(normHeader)
  ) {
    return `Danh mục cố định: ${labels.product}`;
  }
  if (
    [
      normalizeHeader(labels.location),
      "địa chỉ/chi nhánh",
      "dia chi/chi nhanh",
      "địa chỉ / chi nhánh",
      "dia chi / chi nhanh",
      "khu vực",
      "khu vuc",
      "đại lý",
      "dai ly",
      "tên đại lý",
      "ten dai ly",
      "showroom",
      "chi nhánh",
      "chi nhanh",
      "cơ sở",
      "co so",
      "địa điểm",
      "dia diem",
      "location",
    ].includes(normHeader)
  ) {
    return `Danh mục cố định: ${labels.location}`;
  }
  return null;
}

const DATE_VALUE_RE =
  /^(\d{4}-\d{1,2}-\d{1,2}|\d{1,2}[/-]\d{1,2}[/-]\d{4})$/;
const NUMBER_VALUE_RE = /^-?\d+(?:[.,]\d+)?$/;
const TEXT_CODE_HEADER_RE =
  /\b(mã|ma|cccd|cmnd|vin|mst|thuế|thue|số hợp đồng|so hop dong|số hđ|so hd|stk|tài khoản|tai khoan|biển số|bien so|điện thoại|sdt|sđt|zip|postal)\b/i;
const DATE_HEADER_RE = /\b(ngày|ngay|sinh nhật|sinh nhat|date|hạn|han|thời gian|thoi gian)\b/i;
const NUMBER_HEADER_RE =
  /\b(giá|gia|tiền|tien|chi phí|chi phi|doanh thu|ngân sách|ngan sach|lương|luong|số lượng|so luong|tuổi|tuoi|diện tích|dien tich)\b/i;
const SELECT_HEADER_RE =
  /\b(loại|loai|giới tính|gioi tinh|trạng thái|trang thai|tình trạng|tinh trang|nhóm|nhom|hạng|hang|cấp|cap|hình thức|hinh thuc)\b/i;

function inferFieldHeuristically(params: {
  rawHeader: string;
  nonEmptyValues: string[];
  distinctValues: string[];
  hasDateCell: boolean;
}): {
  fieldType: AttrFieldType;
  options: string[];
  reason: string;
} {
  const { rawHeader, nonEmptyValues, distinctValues, hasDateCell } = params;
  const norm = normalizeHeader(rawHeader);

  if (DATE_HEADER_RE.test(norm) || hasDateCell) {
    return {
      fieldType: "date",
      options: [],
      reason: "Tự động nhận diện kiểu Ngày tháng từ tiêu đề / định dạng ô",
    };
  }

  if (
    nonEmptyValues.length > 0 &&
    nonEmptyValues.every((v) => DATE_VALUE_RE.test(v))
  ) {
    return {
      fieldType: "date",
      options: [],
      reason: "Tất cả giá trị mẫu có định dạng ngày tháng",
    };
  }

  if (TEXT_CODE_HEADER_RE.test(norm)) {
    return {
      fieldType: "text",
      options: [],
      reason: "Mã định danh / giấy tờ / hợp đồng (giữ kiểu Văn bản để bảo toàn số 0 ở đầu)",
    };
  }

  if (NUMBER_HEADER_RE.test(norm)) {
    return {
      fieldType: "number",
      options: [],
      reason: "Trường giá trị số / tài chính",
    };
  }

  const allNumericNoLeadingZero =
    nonEmptyValues.length >= 2 &&
    nonEmptyValues.every(
      (v) =>
        NUMBER_VALUE_RE.test(v.replace(/,/g, "")) &&
        !(v.length > 1 && v.startsWith("0") && !v.startsWith("0.")),
    );

  if (allNumericNoLeadingZero) {
    return {
      fieldType: "number",
      options: [],
      reason: "Các giá trị mẫu đều là con số",
    };
  }

  if (
    distinctValues.length >= 2 &&
    distinctValues.length <= 8 &&
    nonEmptyValues.length >= 3 &&
    distinctValues.every((v) => v.length <= 36) &&
    (SELECT_HEADER_RE.test(norm) ||
      nonEmptyValues.length >= distinctValues.length * 3)
  ) {
    return {
      fieldType: "select",
      options: distinctValues,
      reason: `Phát hiện ${distinctValues.length} lựa chọn lặp lại trong dữ liệu`,
    };
  }

  return {
    fieldType: "text",
    options: [],
    reason: "Trường văn bản tự do",
  };
}

function anonymizeSampleValue(val: string): string {
  // Mask 9-12 digit sequences (phone / CCCD) before sending to AI
  return val
    .replace(/\b\d{9,13}\b/g, "[MÃ_SỐ]")
    .replace(/[^\s@]+@[^\s@]+\.[^\s@]+/g, "[EMAIL]")
    .slice(0, 80);
}

export async function analyzeExcelForAttrFields(
  buffer: ArrayBuffer | Buffer | Uint8Array,
  options: {
    existingFields?: AttrFieldRow[];
    labels?: CatalogLabels;
    enableAi?: boolean;
  } = {},
): Promise<AnalyzeAttrFieldsReport> {
  const existingFields = options.existingFields ?? [];
  const labels = options.labels ?? DEFAULT_CATALOG_LABELS;
  const enableAi = options.enableAi ?? true;

  const workbook = new ExcelJS.Workbook();
  const nodeBuffer = Buffer.isBuffer(buffer)
    ? buffer
    : Buffer.from(
        buffer instanceof ArrayBuffer
          ? new Uint8Array(buffer)
          : new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength),
      );

  await workbook.xlsx.load(nodeBuffer as unknown as ExcelJS.Buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet || sheet.rowCount === 0) {
    return {
      headerRowIndex: 1,
      totalRowsScanned: 0,
      mode: "heuristic",
      columns: [],
    };
  }

  const headerRowIndex = findHeaderRowIndex(sheet);
  const headerRow = sheet.getRow(headerRowIndex);

  const existingByKey = new Map<string, AttrFieldRow>();
  const existingByNormLabel = new Map<string, AttrFieldRow>();
  for (const field of existingFields) {
    existingByKey.set(field.key.toLowerCase(), field);
    existingByNormLabel.set(normalizeHeader(field.label), field);
  }

  const maxScanRow = Math.min(sheet.rowCount, headerRowIndex + 250);
  const totalRowsScanned = Math.max(0, maxScanRow - headerRowIndex);

  const rawCols: Array<{
    columnIndex: number;
    rawHeader: string;
    normHeader: string;
  }> = [];

  headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
    const rawHeader = extractCellString(cell);
    const normHeader = normalizeHeader(rawHeader);
    if (!normHeader) return;
    rawCols.push({ columnIndex: colNumber, rawHeader, normHeader });
  });

  const usedKeys = new Set<string>(existingFields.map((f) => f.key.toLowerCase()));
  const columns: AnalyzedAttrColumn[] = [];

  for (const col of rawCols) {
    const nonEmptyValues: string[] = [];
    const distinctSet = new Set<string>();
    let hasDateCell = false;

    for (let r = headerRowIndex + 1; r <= maxScanRow; r++) {
      const cell = sheet.getRow(r).getCell(col.columnIndex);
      if (cell.value instanceof Date) {
        hasDateCell = true;
      }
      const str = extractCellString(cell);
      if (!str) continue;
      nonEmptyValues.push(str);
      if (distinctSet.size < 25) {
        distinctSet.add(str);
      }
    }

    const distinctValues = [...distinctSet];
    const sampleValues = distinctValues.slice(0, 4);

    // 1. Check Core / Catalog
    const coreMatch = matchCoreOrCatalogField(col.normHeader, labels);
    if (coreMatch) {
      const pretty = formatPrettyLabel(col.rawHeader);
      columns.push({
        columnIndex: col.columnIndex,
        rawHeader: col.rawHeader,
        label: pretty,
        key: slugifyAttrKey(col.rawHeader) || `col_${col.columnIndex}`,
        fieldType: "text",
        options: [],
        required: false,
        status: "core",
        statusNote: coreMatch,
        sampleValues,
        nonEmptyCount: nonEmptyValues.length,
      });
      continue;
    }

    // 2. Check Existing AttrField
    const candidateKey = slugifyAttrKey(col.rawHeader) || `col_${col.columnIndex}`;
    const existingMatch =
      existingByNormLabel.get(col.normHeader) ??
      existingByKey.get(candidateKey);

    if (existingMatch) {
      columns.push({
        columnIndex: col.columnIndex,
        rawHeader: col.rawHeader,
        label: existingMatch.label,
        key: existingMatch.key,
        fieldType: existingMatch.fieldType,
        options: existingMatch.options,
        required: existingMatch.required,
        status: "existing",
        statusNote: `Đã tồn tại trong dự án (key: ${existingMatch.key})`,
        sampleValues,
        nonEmptyCount: nonEmptyValues.length,
      });
      continue;
    }

    // 3. New Suggested Custom Field
    let uniqueKey = candidateKey;
    let suffix = 2;
    while (usedKeys.has(uniqueKey)) {
      uniqueKey = `${candidateKey}_${suffix}`;
      suffix++;
    }
    usedKeys.add(uniqueKey);

    const inferred = inferFieldHeuristically({
      rawHeader: col.rawHeader,
      nonEmptyValues,
      distinctValues,
      hasDateCell,
    });

    columns.push({
      columnIndex: col.columnIndex,
      rawHeader: col.rawHeader,
      label: formatPrettyLabel(col.rawHeader),
      key: uniqueKey,
      fieldType: inferred.fieldType,
      options: inferred.options,
      required: col.rawHeader.trim().endsWith("*"),
      status: "suggested",
      statusNote: inferred.reason,
      sampleValues,
      nonEmptyCount: nonEmptyValues.length,
    });
  }

  // 4. Optional AI Refinement for "suggested" columns
  const suggestedCols = columns.filter((c) => c.status === "suggested");
  const candidates = enableAi ? resolveModelCandidates() : [];

  if (suggestedCols.length > 0 && candidates.length > 0) {
    try {
      const payloadForAi = suggestedCols.map((c) => ({
        columnIndex: c.columnIndex,
        rawHeader: c.rawHeader,
        defaultLabel: c.label,
        defaultKey: c.key,
        heuristicType: c.fieldType,
        heuristicOptions: c.options,
        samples: c.sampleValues.map(anonymizeSampleValue),
      }));

      const prompt = `Bạn là chuyên gia thiết kế cơ sở dữ liệu CRM tại Việt Nam.
Hãy phân tích danh sách các cột từ file Excel khách hàng dưới đây và chuẩn hóa cấu hình "Field phụ" (Custom Field) cho CRM.

Quy tắc quan trọng:
1. "label": Nhãn tiếng Việt ngắn gọn, viết hoa chữ cái đầu câu và danh từ riêng/viết tắt (VD: "MÃ ĐẠI LÝ" -> "Mã đại lý", "SỐ CCCD" -> "Số CCCD", "MÃ SỐ THUẾ (CÔNG TY)" -> "Mã số thuế (Công ty)").
2. "fieldType": Chọn đúng 1 trong 6 kiểu: "text" | "number" | "date" | "select" | "multiselect" | "boolean".
   - Các mã số như Mã đại lý, Mã khách hàng, Số CCCD, Mã số thuế, Số hợp đồng, Số VIN bắt buộc dùng "text" (KHÔNG dùng "number" để tránh mất số 0 ở đầu).
   - Các cột ngày tháng (Ngày sinh, Ngày ký hợp đồng, Ngày xuất hóa đơn, Ngày giao xe...) bắt buộc dùng "date".
   - Các cột tiền tệ / số lượng (Giá xe, Ngân sách, Doanh thu...) dùng "number".
   - Chỉ dùng "select" khi cột mang tính phân loại cố định ít lựa chọn (VD: Loại khách hàng: ["Cá nhân", "Tổ chức"], Giới tính: ["Nam", "Nữ", "Khác"], Trạng thái: ["Hoạt Động", "Ngừng hoạt động"]). Không dùng "select" cho các cột có nhiều giá trị mở như Tên tư vấn bán hàng, Địa chỉ, Tỉnh/Thành phố, Chương trình khuyến mãi, Màu sắc.
3. "options": Mảng các chuỗi lựa chọn nếu fieldType là "select" hoặc "multiselect" (lấy từ heuristicOptions hoặc bổ sung hợp lý như Giới tính ["Nam", "Nữ", "Khác"]). Để mảng rỗng [] cho các kiểu khác.
4. "reason": Giải thích ngắn gọn 1 câu tiếng Việt vì sao chọn kiểu dữ liệu đó.

Trả về DUY NHẤT một JSON array hợp lệ theo định dạng:
[{"columnIndex": number, "label": string, "fieldType": string, "options": string[], "reason": string}]

Dữ liệu cột cần phân tích:
${JSON.stringify(payloadForAi)}`;

      const { text } = await generateText({
        model: candidates[0].model,
        prompt,
        maxOutputTokens: 2500,
        temperature: 0.1,
      });

      const jsonMatch = text.match(/\[[\s\S]*\]/);
      if (jsonMatch) {
        const parsedAi = JSON.parse(jsonMatch[0]) as Array<{
          columnIndex?: number;
          label?: string;
          fieldType?: string;
          options?: string[];
          reason?: string;
        }>;

        const validTypes = new Set<AttrFieldType>([
          "text",
          "number",
          "date",
          "select",
          "multiselect",
          "boolean",
        ]);

        const aiByCol = new Map(
          parsedAi
            .filter((item) => typeof item.columnIndex === "number")
            .map((item) => [item.columnIndex!, item]),
        );

        for (const col of suggestedCols) {
          const aiItem = aiByCol.get(col.columnIndex);
          if (!aiItem) continue;
          if (aiItem.label && aiItem.label.trim().length > 0) {
            col.label = aiItem.label.trim().slice(0, 120);
          }
          if (
            aiItem.fieldType &&
            validTypes.has(aiItem.fieldType as AttrFieldType)
          ) {
            const nextType = aiItem.fieldType as AttrFieldType;
            const nextOptions = Array.isArray(aiItem.options)
              ? aiItem.options.map((o) => String(o).trim()).filter(Boolean)
              : col.options;

            if (
              (nextType === "select" || nextType === "multiselect") &&
              nextOptions.length === 0
            ) {
              col.fieldType = "text";
              col.options = [];
            } else {
              col.fieldType = nextType;
              col.options =
                nextType === "select" || nextType === "multiselect"
                  ? nextOptions
                  : [];
            }
          }
          if (aiItem.reason && aiItem.reason.trim()) {
            col.statusNote = `AI: ${aiItem.reason.trim()}`;
          }
        }

        return {
          headerRowIndex,
          totalRowsScanned,
          mode: "ai",
          columns,
        };
      }
    } catch {
      // Fallback to heuristic cleanly if AI call fails or times out
    }
  }

  return {
    headerRowIndex,
    totalRowsScanned,
    mode: "heuristic",
    columns,
  };
}
