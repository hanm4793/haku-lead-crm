"use client";

import * as React from "react";

import { useToast } from "@/components/providers/toast-provider";
import type { LeadComment } from "@/lib/types";

interface LoadedState {
  leadId: string;
  token: number;
  comments: LeadComment[];
  canComment: boolean;
  failed: boolean;
}

/** Chèn bình luận mới vào cây: trả lời vào cuối `replies` của gốc, bình luận gốc vào cuối danh sách. */
function appendComment(comments: LeadComment[], created: LeadComment): LeadComment[] {
  if (!created.parentId) return [...comments, { ...created, replies: [] }];
  return comments.map((c) => (c.id === created.parentId ? { ...c, replies: [...(c.replies ?? []), created] } : c));
}

export function useLeadComments(leadId: string | null) {
  const [loaded, setLoaded] = React.useState<LoadedState | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);
  const [submitting, setSubmitting] = React.useState(false);
  const toast = useToast();

  React.useEffect(() => {
    if (!leadId) return;

    const controller = new AbortController();
    const token = reloadToken;
    const done = (state: Pick<LoadedState, "comments" | "canComment" | "failed">) =>
      setLoaded({ leadId, token, ...state });

    fetch(`/api/leads/${leadId}/comments`, { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error(String(res.status));
        const data = (await res.json()) as { comments?: LeadComment[]; canComment?: boolean };
        done({ comments: data.comments ?? [], canComment: data.canComment ?? false, failed: false });
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        done({ comments: [], canComment: false, failed: true });
      });

    return () => controller.abort();
  }, [leadId, reloadToken]);

  const ready = Boolean(leadId) && loaded?.leadId === leadId && loaded.token === reloadToken;
  const current = ready ? loaded : null;

  const reload = React.useCallback(() => setReloadToken((prev) => prev + 1), []);

  const addComment = React.useCallback(
    async (content: string, parentId?: string | null): Promise<boolean> => {
      if (!leadId) return false;
      const text = content.trim();
      if (!text) return false;

      setSubmitting(true);
      try {
        const res = await fetch(`/api/leads/${leadId}/comments`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: text, parentId }),
        });
        const data = (await res.json().catch(() => ({}))) as { error?: string; comment?: LeadComment };
        if (!res.ok || !data.comment) {
          toast.error("Gửi bình luận thất bại", data.error || "Có lỗi xảy ra.");
          return false;
        }

        const created = data.comment;
        setLoaded((prev) =>
          prev && prev.leadId === leadId ? { ...prev, comments: appendComment(prev.comments, created) } : prev,
        );
        return true;
      } catch {
        toast.error("Lỗi kết nối", "Không thể gửi bình luận lúc này.");
        return false;
      } finally {
        setSubmitting(false);
      }
    },
    [leadId, toast],
  );

  const comments = current?.comments ?? [];
  const commentCount = comments.reduce((total, c) => total + 1 + (c.replies?.length ?? 0), 0);

  return {
    comments,
    commentCount,
    canComment: current?.canComment ?? false,
    loading: Boolean(leadId) && !ready,
    error: current?.failed ?? false,
    submitting,
    reload,
    addComment,
  };
}
