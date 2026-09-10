import ExcelJS from "exceljs";

import { COLUMN_BY_ID, displayValue } from "@/components/leads/columns";
import type { ExportSpec } from "@/lib/ai/export-spec";
import { computeKpis, dimensionValue, type PivotDimension } from "@/lib/metrics";
import type { Lead } from "@/lib/types";
import { formatPercent } from "@/lib/utils";

const HEADER_FILL = "FF12479E";

function writeSheet(sheet: ExcelJS.Worksheet, leads: Lead[], columnIds: string[]) {
  sheet.columns = columnIds.map((id) => {
    const column = COLUMN_BY_ID.get(id);
    return { header: column?.header ?? id, key: id, width: Math.max(12, Math.round((column?.width ?? 140) / 8)) };
  });

  for (const lead of leads) {
    sheet.addRow(Object.fromEntries(columnIds.map((id) => [id, displayValue(lead, id)])));
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
    ["Nội dung export", spec.summary],
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
  while (used.has(candidate)) {
    candidate = `${base.slice(0, 25)} (${i})`;
    i += 1;
  }
  used.add(candidate);
  return candidate;
}

export async function buildLeadWorkbook(spec: ExportSpec, leads: Lead[]): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM THACO Auto";
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
      writeSheet(workbook.addWorksheet(safeSheetName(key, used)), rows, spec.columns);
    }
  } else {
    writeSheet(workbook.addWorksheet("Danh sách lead"), leads, spec.columns);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

export function buildLeadCsv(spec: ExportSpec, leads: Lead[]): string {
  const escape = (v: string) => (/[",\n;]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  const header = spec.columns.map((id) => escape(COLUMN_BY_ID.get(id)?.header ?? id)).join(",");
  const body = leads.map((lead) => spec.columns.map((id) => escape(displayValue(lead, id))).join(",")).join("\n");
  // BOM để Excel trên Windows đọc đúng tiếng Việt.
  return `\uFEFF${header}\n${body}`;
}
