import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/viewer";
import { exportSpecSchema } from "@/lib/ai/export-spec";
import { queryLeads } from "@/lib/ai/query-leads";
import { buildLeadCsv, buildLeadWorkbook } from "@/lib/export/build-workbook";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = exportSpecSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Cấu hình export không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const spec = parsed.data;
  const leads = await queryLeads(spec, viewer);
  const filename = `${spec.title || "danh-sach-lead"}-${new Date().toISOString().slice(0, 10)}`;

  if (spec.format === "csv") {
    return new NextResponse(buildLeadCsv(spec, leads), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}.csv"`,
      },
    });
  }

  const buffer = await buildLeadWorkbook(spec, leads);
  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(filename)}.xlsx"`,
    },
  });
}
