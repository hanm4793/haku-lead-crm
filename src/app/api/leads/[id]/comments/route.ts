import { NextResponse } from "next/server";
import { z } from "zod";

import { canCommentLead } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { CommentInputError, createLeadComment, getLeadComments } from "@/lib/db/lead-comments-repo";
import { getLeadById } from "@/lib/db/leads-repo";

export const runtime = "nodejs";

const postCommentSchema = z.object({
  content: z
    .string()
    .trim()
    .min(1, "Nội dung bình luận không được để trống.")
    .max(3000, "Nội dung tối đa 3.000 ký tự."),
  parentId: z.string().uuid().nullable().optional(),
});

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;

  const lead = await getLeadById(id, viewer);
  if (!lead) return NextResponse.json({ error: "Không tìm thấy lead hoặc không có quyền xem" }, { status: 404 });

  const comments = await getLeadComments(id);
  const canComment = canCommentLead(viewer, { assigneeId: lead.assigneeId });

  return NextResponse.json({ comments, canComment });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const viewer = await getScopedViewer();
  if (!viewer) return NextResponse.json({ error: "Chưa đăng nhập" }, { status: 401 });

  const { id } = await params;

  const lead = await getLeadById(id, viewer);
  if (!lead) return NextResponse.json({ error: "Không tìm thấy lead hoặc không có quyền xem" }, { status: 404 });

  if (!canCommentLead(viewer, { assigneeId: lead.assigneeId })) {
    return NextResponse.json({ error: "Bạn không có quyền bình luận trên lead này." }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Dữ liệu JSON không hợp lệ." }, { status: 400 });
  }

  const parsed = postCommentSchema.safeParse(body);
  if (!parsed.success) {
    const issue = parsed.error.issues[0]?.message ?? "Dữ liệu không hợp lệ.";
    return NextResponse.json({ error: issue }, { status: 400 });
  }

  try {
    const comment = await createLeadComment(
      {
        leadId: id,
        content: parsed.data.content,
        parentId: parsed.data.parentId,
      },
      viewer,
    );
    return NextResponse.json({ ok: true, comment });
  } catch (error) {
    if (error instanceof CommentInputError) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    console.error("[lead-comments] create failed", error);
    return NextResponse.json({ error: "Thêm bình luận thất bại." }, { status: 500 });
  }
}
