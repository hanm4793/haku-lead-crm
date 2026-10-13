"use client";

import * as React from "react";
import { CornerDownRight, Loader2, MessageSquare, RotateCw, Send, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatDateTime } from "@/lib/utils";
import type { LeadComment } from "@/lib/types";

const AVATAR_COLORS = [
  "bg-blue-100 text-blue-700 border-blue-200",
  "bg-emerald-100 text-emerald-700 border-emerald-200",
  "bg-violet-100 text-violet-700 border-violet-200",
  "bg-amber-100 text-amber-700 border-amber-200",
  "bg-rose-100 text-rose-700 border-rose-200",
  "bg-cyan-100 text-cyan-700 border-cyan-200",
  "bg-indigo-100 text-indigo-700 border-indigo-200",
];

const ROLE_BADGES: Record<string, { label: string; className: string }> = {
  SUPER_ADMIN: { label: "Super admin", className: "border-rose-200 bg-rose-50 text-rose-700" },
  PARTNER_ADMIN: { label: "Partner admin", className: "border-indigo-200 bg-indigo-50 text-indigo-700" },
  STAFF: { label: "Nhân viên", className: "border-slate-200 bg-slate-100 text-slate-600" },
};

function getAvatarColor(name: string): string {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) - hash + name.charCodeAt(i);
  }
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}

function getInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function isSubmitShortcut(e: React.KeyboardEvent) {
  return (e.ctrlKey || e.metaKey) && e.key === "Enter";
}

function RoleBadge({ role }: { role?: string | null }) {
  const badge = role ? ROLE_BADGES[role] : undefined;
  if (!badge) return null;
  return (
    <span className={cn("rounded border px-1 py-0.5 text-[10px] font-medium", badge.className)}>{badge.label}</span>
  );
}

/** Một bình luận (gốc hoặc trả lời): avatar, người viết, thời gian, nội dung và nút "Trả lời". */
function CommentItem({
  comment,
  compact = false,
  onReply,
}: {
  comment: LeadComment;
  compact?: boolean;
  /** Không truyền = không được phép trả lời. */
  onReply?: () => void;
}) {
  return (
    <div className="flex items-start gap-2.5">
      <div
        className={cn(
          "flex shrink-0 items-center justify-center rounded-full border font-semibold",
          compact ? "size-6 text-[10px]" : "size-7 text-[11px]",
          getAvatarColor(comment.userName),
        )}
        title={comment.userName}
      >
        {getInitials(comment.userName)}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-semibold text-slate-800">{comment.userName}</span>
          <RoleBadge role={comment.userRole} />
          <span className="text-[11px] text-muted-foreground">· {formatDateTime(comment.createdAt)}</span>
        </div>
        <div
          className={cn(
            "mt-0.5 whitespace-pre-wrap wrap-break-word leading-relaxed text-slate-700",
            compact ? "text-[12.5px]" : "text-[13px]",
          )}
        >
          {comment.content}
        </div>
        {onReply && (
          <button
            type="button"
            onClick={onReply}
            className="mt-1 flex items-center gap-1 text-[11px] font-medium text-slate-500 transition-colors hover:text-primary"
          >
            <CornerDownRight className="size-3" />
            Trả lời
          </button>
        )}
      </div>
    </div>
  );
}

interface LeadCommentsSectionProps {
  comments: LeadComment[];
  loading: boolean;
  error?: boolean;
  onRetry?: () => void;
  submitting: boolean;
  canComment: boolean;
  readOnly?: boolean;
  onAddComment: (content: string, parentId?: string | null) => Promise<boolean>;
}

export function LeadCommentsSection({
  comments,
  loading,
  error = false,
  onRetry,
  submitting,
  canComment,
  readOnly = false,
  onAddComment,
}: LeadCommentsSectionProps) {
  const [rootText, setRootText] = React.useState("");
  const [replyTarget, setReplyTarget] = React.useState<{ rootId: string; targetUserName: string } | null>(null);
  const [replyText, setReplyText] = React.useState("");

  const isPostingAllowed = canComment && !readOnly;

  const handlePostRoot = async () => {
    if (!rootText.trim() || submitting || !isPostingAllowed) return;
    if (await onAddComment(rootText)) setRootText("");
  };

  const handlePostReply = async () => {
    if (!replyTarget || !replyText.trim() || submitting || !isPostingAllowed) return;
    if (await onAddComment(replyText, replyTarget.rootId)) {
      setReplyText("");
      setReplyTarget(null);
    }
  };

  const startReply = (rootId: string, authorName: string, mention: boolean) => {
    setReplyTarget({ rootId, targetUserName: authorName });
    setReplyText(mention ? `@${authorName} ` : "");
  };

  const cancelReply = () => {
    setReplyTarget(null);
    setReplyText("");
  };

  return (
    <div className="space-y-4">
      {/* Danh sách bình luận & threads (cũ → mới), ô nhập nằm dưới để thấy ngay bình luận vừa gửi */}
      {loading ? (
        <div className="flex items-center justify-center py-8 text-xs text-muted-foreground">
          <Loader2 className="mr-2 size-4 animate-spin text-primary" />
          Đang tải bình luận...
        </div>
      ) : error ? (
        <div className="flex flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-rose-200 bg-rose-50/40 py-8 text-center">
          <p className="text-xs font-medium text-rose-700">Không tải được bình luận</p>
          {onRetry && (
            <Button type="button" variant="outline" size="sm" className="h-7 gap-1.5 text-xs" onClick={onRetry}>
              <RotateCw className="size-3.5" />
              Thử lại
            </Button>
          )}
        </div>
      ) : comments.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border py-8 text-center">
          <MessageSquare className="size-8 text-slate-300" />
          <p className="mt-2 text-xs font-medium text-slate-600">Chưa có bình luận nào</p>
          <p className="text-[11px] text-muted-foreground">
            {isPostingAllowed ? "Hãy bắt đầu trao đổi về khách hàng này." : "Chưa có trao đổi nào về khách hàng này."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {comments.map((comment) => {
            const replies = comment.replies ?? [];
            const isReplyingThis = replyTarget?.rootId === comment.id;

            return (
              <div key={comment.id} className="rounded-lg border border-border/80 bg-white p-3 shadow-2xs">
                <CommentItem
                  comment={comment}
                  onReply={isPostingAllowed ? () => startReply(comment.id, comment.userName, false) : undefined}
                />

                {replies.length > 0 && (
                  <div className="mt-3 space-y-2.5 border-l-2 border-slate-200 pl-3.5 sm:ml-4 sm:pl-4">
                    {replies.map((reply) => (
                      <CommentItem
                        key={reply.id}
                        comment={reply}
                        compact
                        onReply={isPostingAllowed ? () => startReply(comment.id, reply.userName, true) : undefined}
                      />
                    ))}
                  </div>
                )}

                {isReplyingThis && (
                  <div className="mt-3 rounded-md border border-primary/20 bg-primary/5 p-2.5 sm:ml-4">
                    <div className="mb-1.5 flex items-center justify-between text-[11px] font-medium text-primary">
                      <span>Trả lời @{replyTarget.targetUserName}</span>
                      <button
                        type="button"
                        onClick={cancelReply}
                        className="text-muted-foreground hover:text-foreground"
                        title="Hủy trả lời"
                        aria-label="Hủy trả lời"
                      >
                        <X className="size-3.5" />
                      </button>
                    </div>
                    <Textarea
                      value={replyText}
                      onChange={(e) => setReplyText(e.target.value)}
                      placeholder="Nhập câu trả lời... (Ctrl+Enter để gửi)"
                      rows={2}
                      maxLength={3000}
                      autoFocus
                      disabled={submitting}
                      className="min-h-14 resize-y bg-white text-[12.5px]"
                      onKeyDown={(e) => {
                        if (isSubmitShortcut(e)) {
                          e.preventDefault();
                          void handlePostReply();
                        }
                      }}
                    />
                    <div className="mt-2 flex items-center justify-end gap-1.5">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        disabled={submitting}
                        onClick={cancelReply}
                        className="h-6 px-2 text-[11px]"
                      >
                        Hủy
                      </Button>
                      <Button
                        type="button"
                        size="sm"
                        disabled={!replyText.trim() || submitting}
                        onClick={() => void handlePostReply()}
                        className="h-6 gap-1 px-2.5 text-[11px]"
                      >
                        {submitting ? <Loader2 className="size-3 animate-spin" /> : <Send className="size-3" />}
                        Gửi trả lời
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Ô nhập bình luận gốc */}
      <div className="rounded-lg border border-border bg-slate-50/60 p-3">
        <div className="space-y-2">
          <Textarea
            value={rootText}
            onChange={(e) => setRootText(e.target.value)}
            placeholder={
              isPostingAllowed
                ? "Viết bình luận, trao đổi về lead này... (Ctrl+Enter để gửi)"
                : "Chỉ người phụ trách hoặc quản lý mới có quyền bình luận trên lead này."
            }
            disabled={!isPostingAllowed || submitting}
            rows={2}
            maxLength={3000}
            className="min-h-16 resize-y bg-white text-[13px]"
            onKeyDown={(e) => {
              if (isSubmitShortcut(e)) {
                e.preventDefault();
                void handlePostRoot();
              }
            }}
          />
          <div className="flex items-center justify-between">
            <span className="text-[11px] text-muted-foreground">
              {isPostingAllowed ? `${rootText.length}/3000` : ""}
            </span>
            <Button
              type="button"
              size="sm"
              disabled={!isPostingAllowed || !rootText.trim() || submitting}
              onClick={() => void handlePostRoot()}
              className="h-7 gap-1.5 px-3 text-xs"
            >
              {submitting && !replyTarget ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Gửi bình luận
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
