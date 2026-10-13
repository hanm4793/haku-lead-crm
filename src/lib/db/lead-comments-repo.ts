import { asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import type { ViewerScope } from "@/lib/db/leads-repo";
import { leadComments } from "@/lib/db/schema";
import type { LeadComment } from "@/lib/types";

export interface CommentViewerScope extends ViewerScope {
  fullName?: string | null;
}

export interface RawCommentRow {
  id: string;
  leadId: string;
  userId: string | null;
  userName: string;
  userRole: string | null;
  content: string;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Gom nhóm danh sách bình luận phẳng thành cây lồng tối đa 1 cấp:
 * - Bình luận gốc: parentId == null (hoặc không tìm thấy parentId)
 * - Trả lời: parentId trỏ tới bình luận gốc, nằm trong mảng `replies` của bình luận gốc đó.
 */
export function buildCommentThreads(rows: RawCommentRow[]): LeadComment[] {
  const commentMap = new Map<string, LeadComment>();
  const rootComments: LeadComment[] = [];

  for (const row of rows) {
    commentMap.set(row.id, toLeadComment(row));
  }

  for (const comment of commentMap.values()) {
    if (!comment.parentId) {
      rootComments.push(comment);
    } else {
      const parent = commentMap.get(comment.parentId);
      if (parent) {
        parent.replies = parent.replies ?? [];
        parent.replies.push(comment);
      } else {
        // Fallback: nếu parent bị mất hoặc orphan thì đưa lên root để không mất dữ liệu
        rootComments.push(comment);
      }
    }
  }

  return rootComments;
}

/** Lỗi do dữ liệu người dùng gửi lên (route trả 400). */
export class CommentInputError extends Error {}

function toLeadComment(row: RawCommentRow): LeadComment {
  return {
    id: row.id,
    leadId: row.leadId,
    userId: row.userId,
    userName: row.userName,
    userRole: row.userRole,
    content: row.content,
    parentId: row.parentId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    replies: [],
  };
}

/** Caller phải đã kiểm tra quyền xem lead (route dùng `getLeadById` với viewer). */
export async function getLeadComments(leadId: string): Promise<LeadComment[]> {
  const rows = await getDb()
    .select()
    .from(leadComments)
    .where(eq(leadComments.leadId, leadId))
    .orderBy(asc(leadComments.createdAt));

  return buildCommentThreads(rows);
}

/** Caller phải đã kiểm tra quyền bình luận trên lead (`canCommentLead`). */
export async function createLeadComment(
  input: {
    leadId: string;
    content: string;
    parentId?: string | null;
  },
  viewer: CommentViewerScope,
): Promise<LeadComment> {
  const content = input.content.trim();
  if (!content) {
    throw new CommentInputError("Nội dung bình luận không được để trống.");
  }
  if (content.length > 3000) {
    throw new CommentInputError("Nội dung bình luận tối đa 3.000 ký tự.");
  }

  let effectiveParentId: string | null = null;
  if (input.parentId) {
    const parentRows = await getDb()
      .select({
        id: leadComments.id,
        leadId: leadComments.leadId,
        parentId: leadComments.parentId,
      })
      .from(leadComments)
      .where(eq(leadComments.id, input.parentId))
      .limit(1);

    if (parentRows.length === 0 || parentRows[0].leadId !== input.leadId) {
      throw new CommentInputError("Không tìm thấy bình luận cần trả lời.");
    }

    const parent = parentRows[0];
    // Chỉ lồng 1 cấp duy nhất: nếu reply vào một comment con, tự động gắn vào bình luận gốc của thread
    effectiveParentId = parent.parentId ? parent.parentId : parent.id;
  }

  const [inserted] = await getDb()
    .insert(leadComments)
    .values({
      leadId: input.leadId,
      userId: viewer.appUserId ?? null,
      userName: viewer.fullName?.trim() || "Người dùng",
      userRole: viewer.role,
      content,
      parentId: effectiveParentId,
    })
    .returning();

  return toLeadComment(inserted);
}
