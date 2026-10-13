import ExcelJS from "exceljs";

import { ATTR_COLUMN_PREFIX, COLUMN_BY_ID, displayValue } from "@/components/leads/columns";
import type { AttrFieldRow } from "@/lib/db/attr-fields-repo";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { computeKpis, dimensionValue, type PivotDimension } from "@/lib/metrics";
import type { Lead } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

const HEADER_FILL = "FF12479E";

/** Chống formula injection trong Excel / CSV khi chuỗi bắt đầu bằng =, +, -, @. */
export function sanitizeFormulaText(value: string): string {
  if (/^[\t\r\n ]*[=+\-@]/.test(value)) {
    return `'${value}`;
  }
  return value;
}

/** Tiêu đề cột: field phụ lấy nhãn đã cấu hình, không có thì dùng key. */
function columnHeaderText(id: string, attrFields: AttrFieldRow[]) {
  if (id.startsWith(ATTR_COLUMN_PREFIX)) {
    const key = id.slice(ATTR_COLUMN_PREFIX.length);
    return attrFields.find((f) => f.key === key)?.label ?? key;
  }
  return COLUMN_BY_ID.get(id)?.header ?? id;
}

function writeSheet(sheet: ExcelJS.Worksheet, leads: Lead[], columnIds: string[], attrFields: AttrFieldRow[]) {
  sheet.columns = columnIds.map((id) => {
    const column = COLUMN_BY_ID.get(id);
    return { header: columnHeaderText(id, attrFields), key: id, width: Math.max(12, Math.round((column?.width ?? 140) / 8)) };
  });

  for (const lead of leads) {
    sheet.addRow(
      Object.fromEntries(columnIds.map((id) => [id, sanitizeFormulaText(displayValue(lead, id, attrFields))])),
    );
  }

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" }, size: 11 };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
  header.alignment = { vertical: "middle" };
  header.height = 22;
  sheet.views = [{ state: "frozen", ySplit: 1 }];
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columnIds.length } };
}

function writeSummarySheet(sheet: ExcelJS.Worksheet, leads: Lead[], spec: ExportSpec) {
  sheet.columns = [
    { header: "Chỉ số", key: "metric", width: 34 },
    { header: "Giá trị", key: "value", width: 20 },
  ];
  const kpis = computeKpis(leads);
  const rows: [string, string | number][] = [
    ["Nội dung export", sanitizeFormulaText(spec.summary)],
    ["Tổng lead", kpis.total],
    ["Đã liên hệ", kpis.contacted],
    ["Tỷ lệ liên hệ", formatPercent(kpis.contactRate)],
    ["KHQT (quan tâm trở lên)", kpis.khqt],
    ["Tỷ lệ KHQT / đã liên hệ", formatPercent(kpis.khqtRate)],
    ["GDTD (giao dịch trở lên)", kpis.gdtd],
    ["Ký hợp đồng", kpis.khd],
    ["Bị loại", kpis.failed],
    ["Tỷ lệ mất khách", formatPercent(kpis.failRate)],
    ["Quá hạn gọi lại", kpis.overdue],
  ];
  for (const [metric, value] of rows) sheet.addRow({ metric, value });

  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: "FFFFFFFF" } };
  header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
}

/** Tên sheet trong Excel không được chứa các ký tự này và tối đa 31 ký tự. */
function safeSheetName(name: string, used: Set<string>) {
  const base = name.replace(/[\\/*?:[\]]/g, "-").slice(0, 28).trim() || "Sheet";
  let candidate = base;
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    candidate = `${base.slice(0, 25)} (${i})`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function buildLeadWorkbook(
  spec: ExportSpec,
  leads: Lead[],
  attrFields: AttrFieldRow[] = [],
): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SEMTOP Marketing CRM";
  workbook.created = new Date();

  if (spec.includeSummarySheet) {
    writeSummarySheet(workbook.addWorksheet("Tổng hợp"), leads, spec);
  }

  if (spec.splitSheetsBy) {
    const dim = spec.splitSheetsBy as PivotDimension;
    const groups = new Map<string, Lead[]>();
    for (const lead of leads) {
      const key = dimensionValue(lead, dim);
      const bucket = groups.get(key) ?? [];
      bucket.push(lead);
      groups.set(key, bucket);
    }
    const used = new Set<string>();
    const sorted = [...groups.entries()].sort((a, b) => b[1].length - a[1].length);
    for (const [key, rows] of sorted) {
      writeSheet(workbook.addWorksheet(safeSheetName(key, used)), rows, spec.columns, attrFields);
    }
  } else {
    writeSheet(workbook.addWorksheet("Danh sách lead"), leads, spec.columns, attrFields);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildLeadCsv(spec: ExportSpec, leads: Lead[], attrFields: AttrFieldRow[] = []): string {
  const escape = (v: string) => {
    const safe = sanitizeFormulaText(v);
    return /[",\n;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
  };
  const header = spec.columns.map((id) => escape(columnHeaderText(id, attrFields))).join(",");
  const body = leads.map((lead) => spec.columns.map((id) => escape(displayValue(lead, id, attrFields))).join(",")).join("\n");
  // BOM để Excel trên Windows đọc đúng tiếng Việt.
  return `\uFEFF${header}\n${body}`;
}
