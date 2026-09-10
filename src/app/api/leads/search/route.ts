import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/viewer";
import { queryLeadPage } from "@/lib/db/leads-repo";
import { leadSearchSchema } from "@/lib/leads/query";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const parsed = leadSearchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Tham số không hợp lệ", issues: parsed.error.issues }, { status: 400 });
  }

  const result = await queryLeadPage(parsed.data, viewer);
  return NextResponse.json(result);
}
