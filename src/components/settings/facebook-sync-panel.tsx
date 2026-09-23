"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  addFacebookPageAction,
  purgeSampleLeadsAction,
  removeFacebookPageAction,
  setFacebookPageActiveAction,
  syncFacebookInsightsAction,
  syncFacebookLeadsAction,
} from "@/app/settings/facebook-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import type { FacebookPageRow } from "@/lib/db/facebook-pages-repo";

export type LastSyncInfo = {
  at: string;
  status: string;
  message: string | null;
} | null;

function formatSyncTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
  });
}

function SyncTimeLabel({ iso }: { iso: string }) {
  return (
    <span className="font-medium" suppressHydrationWarning>
      {formatSyncTime(iso)}
    </span>
  );
}

function statusBadge(status: string) {
  if (status === "ok") return <Badge variant="success">Thành công</Badge>;
  if (status === "error") return <Badge variant="danger">Lỗi</Badge>;
  return <Badge variant="muted">{status}</Badge>;
}

function SyncSummary({
  label,
  sync,
  error,
}: {
  label: string;
  sync: LastSyncInfo;
  error: string | null;
}) {
  if (error) {
    return (
      <p className="text-xs text-rose-700" role="alert">
        Không tải được lịch sử {label.toLowerCase()}: {error}
      </p>
    );
  }
  if (!sync) {
    return <p className="text-xs text-muted-foreground">Chưa có lịch sử {label.toLowerCase()}.</p>;
  }
  return (
    <div className="space-y-1 border-t border-border/60 pt-2 text-[13px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">{label} gần nhất</span>
        <SyncTimeLabel iso={sync.at} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-muted-foreground">Kết quả</span>
        {statusBadge(sync.status)}
      </div>
      {sync.message ? <p className="text-xs text-muted-foreground">{sync.message}</p> : null}
    </div>
  );
}

export function FacebookSyncPanel({
  tokenConfigured,
  insightsConfigured,
  dbConfigured,
  pages,
  lastLeadSync,
  leadSyncError,
  lastInsightsSync,
  insightsSyncError,
  isAdmin,
}: {
  tokenConfigured: boolean;
  insightsConfigured: boolean;
  dbConfigured: boolean;
  pages: FacebookPageRow[];
  lastLeadSync: LastSyncInfo;
  leadSyncError: string | null;
  lastInsightsSync: LastSyncInfo;
  insightsSyncError: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingSync, setPendingSync] = React.useState(false);
  const [pendingInsights, setPendingInsights] = React.useState(false);
  const [pendingPurge, setPendingPurge] = React.useState(false);
  const [pendingPage, setPendingPage] = React.useState(false);
  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const [newPageId, setNewPageId] = React.useState("");
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const actionsBlocked = !dbConfigured;
  const anyPending = pendingSync || pendingInsights || pendingPurge || pendingPage;
  const activePageCount = pages.filter((page) => page.active).length;
  const canSyncLeads = tokenConfigured && activePageCount > 0;

  async function runSync() {
    setPendingSync(true);
    setActionFeedback(null);
    setActionError(null);
    try {
      const outcome = await syncFacebookLeadsAction();
      if (!outcome.ok) {
        setActionError(outcome.error);
        return;
      }
      const { imported, updated, skipped, errors, message } = outcome.result;
      setActionFeedback(
        `${message} (mới: ${imported}, cập nhật: ${updated}, bỏ qua: ${skipped}, lỗi: ${errors})`,
      );
      router.refresh();
    } finally {
      setPendingSync(false);
    }
  }

  async function runPurge() {
    setPurgeOpen(false);
    setPendingPurge(true);
    setActionFeedback(null);
    setActionError(null);
    try {
      const outcome = await purgeSampleLeadsAction();
      if (!outcome.ok) {
        setActionError(outcome.error);
        return;
      }
      setActionFeedback(`Đã xóa ${outcome.deleted} lead mẫu (không có facebook_lead_id).`);
      router.refresh();
    } finally {
      setPendingPurge(false);
    }
  }

  async function runInsightsSync() {
    setPendingInsights(true);
    setActionFeedback(null);
    setActionError(null);
    try {
      const outcome = await syncFacebookInsightsAction();
      if (!outcome.ok) {
        setActionError(outcome.error);
        return;
      }
      const { imported, updated, skipped, errors, message } = outcome.result;
      setActionFeedback(
        `${message} (mới: ${imported}, cập nhật: ${updated}, bỏ qua: ${skipped}, lỗi: ${errors})`,
      );
      router.refresh();
    } finally {
      setPendingInsights(false);
    }
  }

  async function addPage() {
    setPendingPage(true);
    setActionFeedback(null);
    setActionError(null);
    try {
      const outcome = await addFacebookPageAction({ facebookPageId: newPageId });
      if (!outcome.ok) {
        setActionError(outcome.error);
        return;
      }
      setNewPageId("");
      setActionFeedback(`Đã thêm Fanpage ${outcome.page?.name ?? outcome.page?.facebookPageId}.`);
      router.refresh();
    } finally {
      setPendingPage(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Facebook · đa Fanpage</span>
        <Badge variant={tokenConfigured ? "success" : "warning"}>
          {tokenConfigured ? "Token OK" : "Thiếu token"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Quản lý nhiều Fanpage (mỗi page ≈ một dự án/kênh). Đồng bộ lead lấy tất cả page đang bật.
        Insights dùng Ad Account trong env.
      </p>

      {!dbConfigured ? (
        <p className="text-xs text-amber-800">Cần DATABASE_URL để lưu Fanpage và lịch sử đồng bộ.</p>
      ) : null}

      {dbConfigured ? (
        <div className="space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
            Fanpage ({activePageCount} đang bật / {pages.length})
          </div>
          {pages.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Chưa có Fanpage trong DB. Thêm Page ID bên dưới (hoặc khai báo FACEBOOK_PAGE_IDS rồi
              đồng bộ lần đầu để bootstrap).
            </p>
          ) : (
            <ul className="space-y-1.5">
              {pages.map((page) => (
                <li
                  key={page.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded border border-border/50 bg-card px-2 py-1.5 text-[13px]"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium text-slate-800">
                      {page.name?.trim() || "Chưa có tên"}
                    </div>
                    <div className="font-mono text-[11px] text-muted-foreground">{page.facebookPageId}</div>
                  </div>
                  {isAdmin ? (
                    <div className="flex items-center gap-2">
                      <Switch
                        checked={page.active}
                        disabled={anyPending}
                        onCheckedChange={(checked) => {
                          void (async () => {
                            setPendingPage(true);
                            setActionError(null);
                            const outcome = await setFacebookPageActiveAction({
                              id: page.id,
                              active: checked,
                            });
                            setPendingPage(false);
                            if (!outcome.ok) setActionError(outcome.error);
                            else router.refresh();
                          })();
                        }}
                      />
                      <Button
                        type="button"
                        size="xs"
                        variant="ghost"
                        disabled={anyPending}
                        onClick={() => {
                          void (async () => {
                            setPendingPage(true);
                            setActionError(null);
                            const outcome = await removeFacebookPageAction(page.id);
                            setPendingPage(false);
                            if (!outcome.ok) setActionError(outcome.error);
                            else router.refresh();
                          })();
                        }}
                      >
                        Xóa
                      </Button>
                    </div>
                  ) : (
                    <Badge variant={page.active ? "success" : "muted"}>
                      {page.active ? "Bật" : "Tắt"}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}

          {isAdmin ? (
            <div className="flex flex-wrap gap-2">
              <Input
                value={newPageId}
                onChange={(e) => setNewPageId(e.target.value)}
                placeholder="Thêm Page ID (số)"
                className="h-8 max-w-xs"
              />
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={anyPending || !newPageId.trim() || actionsBlocked || !tokenConfigured}
                onClick={() => void addPage()}
              >
                {pendingPage ? "Đang thêm…" : "Thêm Fanpage"}
              </Button>
            </div>
          ) : null}
        </div>
      ) : null}

      {dbConfigured ? (
        <>
          <SyncSummary label="Đồng bộ lead" sync={lastLeadSync} error={leadSyncError} />
          <SyncSummary
            label="Đồng bộ Insights"
            sync={lastInsightsSync}
            error={insightsSyncError}
          />
        </>
      ) : null}

      {actionError ? (
        <p className="text-xs text-rose-700" role="alert">
          {actionError}
        </p>
      ) : null}
      {actionFeedback ? (
        <p className="text-xs text-emerald-800" role="status">
          {actionFeedback}
        </p>
      ) : null}

      {isAdmin ? (
        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            type="button"
            size="sm"
            disabled={anyPending || !canSyncLeads || actionsBlocked}
            onClick={() => void runSync()}
          >
            {pendingSync ? "Đang đồng bộ…" : "Đồng bộ Facebook Lead"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyPending || !insightsConfigured || actionsBlocked}
            onClick={() => void runInsightsSync()}
          >
            {pendingInsights ? "Đang đồng bộ…" : "Đồng bộ Insights"}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={anyPending || actionsBlocked}
            onClick={() => setPurgeOpen(true)}
          >
            {pendingPurge ? "Đang xóa…" : "Xóa lead mẫu"}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Chỉ ADMIN mới quản lý Fanpage / đồng bộ.</p>
      )}

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent showClose={!pendingPurge}>
          <DialogHeader>
            <DialogTitle>Xóa lead mẫu?</DialogTitle>
            <DialogDescription>
              Xóa mọi lead không có facebook_lead_id. Lead Facebook và danh mục không bị ảnh hưởng.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button type="button" variant="outline" disabled={pendingPurge} onClick={() => setPurgeOpen(false)}>
              Hủy
            </Button>
            <Button type="button" variant="destructive" disabled={pendingPurge} onClick={() => void runPurge()}>
              {pendingPurge ? "Đang xóa…" : "Xóa lead mẫu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
