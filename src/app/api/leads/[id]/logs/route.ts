import { NextResponse } from "next/server";

import { getViewer } from "@/lib/auth/viewer";
import { getActivityLogs, getLeadById } from "@/lib/db/leads-repo";

export const runtime = "nodejs";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;

  // Kiểm tra quyền xem lead trước khi trả lịch sử của nó.
  const lead = await getLeadById(id, viewer);
  if (!lead) return NextResponse.json({ error: "Không tìm thấy lead" }, { status: 404 });

  return NextResponse.json({ logs: await getActivityLogs(id) });
}
