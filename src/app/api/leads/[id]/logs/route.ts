import { NextResponse } from "next/server";

import { getScopedViewer } from "@/lib/auth/viewer";
import { getActivityLogs, getLeadById } from "@/lib/db/leads-repo";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;

  // Chạy song song lấy chi tiết đầy đủ của lead (gồm attrs JSONB) và lịch sử hoạt động trong 1 round-trip
  const [lead, logs] = await Promise.all([getLeadById(id, viewer), getActivityLogs(id)]);
  if (!lead) return NextResponse.json({ error: "Không tìm thấy lead" }, { status: 404 });

  return NextResponse.json({ lead, logs });
}
