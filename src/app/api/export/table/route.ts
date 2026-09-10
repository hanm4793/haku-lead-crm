import ExcelJS from "exceljs";
import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

/** Export tổng quát cho các bảng đã tính sẵn ở client (bảng pivot báo cáo). */
const payloadSchema = z.object({
  filename: z.string().default("bao-cao"),
  sheets: z
    .array(
      z.object({
        name: z.string(),
        columns: z.array(z.object({ key: z.string(), header: z.string(), width: z.number().optional() })),
        rows: z.array(z.record(z.string(), z.union([z.string(), z.number(), z.null()]))),
      }),
    )
    .min(1),
});

export async function POST(request: Request) {
  const parsed = payloadSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Payload không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const workbook = new ExcelJS.Workbook();
  workbook.creator = "CRM THACO Auto";

  for (const sheetSpec of parsed.data.sheets) {
    const sheet = workbook.addWorksheet(sheetSpec.name.replace(/[\\/*?:[\]]/g, "-").slice(0, 31));
    sheet.columns = sheetSpec.columns.map((c) => ({ header: c.header, key: c.key, width: c.width ?? 16 }));
    for (const row of sheetSpec.rows) sheet.addRow(row);

    const header = sheet.getRow(1);
    header.font = { bold: true, color: { argb: "FFFFFFFF" } };
    header.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF12479E" } };
    header.height = 22;
    sheet.views = [{ state: "frozen", ySplit: 1 }];
  }

  const buffer = await workbook.xlsx.writeBuffer();
  const filename = `${parsed.data.filename}-${new Date().toISOString().slice(0, 10)}.xlsx`;

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}"`,
    },
  });
}
