import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";

import { canViewReports } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { sanitizeFormulaText } from "@/lib/export/build-workbook";
import { toDateInputValue } from "@/lib/utils";

export const runtime = "nodejs";

/** Export tổng quát cho các bảng đã tính sẵn ở client (bảng pivot báo cáo). */
const payloadSchema = z.object({
  filename: z.string().max(120).default("bao-cao"),
  sheets: z
    .array(
      z.object({
        name: z.string(),
        columns: z.array(z.object({ key: z.string(), header: z.string(), width: z.number().optional() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))).max(10000),
      }),
    )
    .min(1)
    .max(20),
});

function uniqueSheetName(raw: string, used: Set<string>): string {
  const cleaned = raw.replace(/[\\/*?:[\]]/g, "-").trim() || "Sheet";
  let candidate = cleaned.slice(0, 31);
  let i = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` (${i})`;
    candidate = `${cleaned.slice(0, Math.max(1, 31 - suffix.length))}${suffix}`;
    i += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

export async function POST(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer || !canViewReports(viewer.role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "SEMTOP Marketing CRM";
  const usedSheetNames = new Set<string>();

  for (const sheetSpec of parsed.data.sheets) {
    const sheet = workbook.addWorksheet(uniqueSheetName(sheetSpec.name, usedSheetNames));
    sheet.columns = sheetSpec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
    for (const row of sheetSpec.rows) {
      const safeRow = Object.fromEntries(
        Object.entries(row).map(([k, v]) => [k, typeof v === "string" ? sanitizeFormulaText(v) : v]),
      );
      sheet.addRow(safeRow);
    }

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12479E" } };
    header.height = 22;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${parsed.data.filename}-${toDateInputValue(new Date().toISOString())}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
