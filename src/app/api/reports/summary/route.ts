import { NextResponse } from "next/server";
import { z } from "zod";

import { canViewReports } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { leadFiltersSchema } from "@/lib/leads/query";
import { PIVOT_DIMENSIONS, type PivotDimension } from "@/lib/metrics";
import { buildReportSummary } from "@/lib/reports/summary";

export const runtime = "nodejs";

const DIMENSION_IDS = Object.keys(PIVOT_DIMENSIONS) as [PivotDimension, ...PivotDimension[]];

const requestSchema = z.object({
  filters: leadFiltersSchema,
  groupBy: z.enum(DIMENSION_IDS).default("product"),
  splitBy: z.enum(DIMENSION_IDS).nullable().default(null),
});

export async function POST(request: Request) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });
  if (!canViewReports(viewer.role)) {
    return NextResponse.json({ error: "Bạn không có quyền xem báo cáo." }, { status: 403 });
  }

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Tham số không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  return NextResponse.json(await buildReportSummary(parsed.data, viewer));
}
