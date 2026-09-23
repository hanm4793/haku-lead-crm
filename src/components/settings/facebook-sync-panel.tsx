"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  purgeSampleLeadsAction,
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
  if (status === "ok") {
    return <Badge variant="success">Thành công</Badge>;
  }
  if (status === "error") {
    return <Badge variant="danger">Lỗi</Badge>;
  }
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
  configured,
  insightsConfigured,
  dbConfigured,
  lastLeadSync,
  leadSyncError,
  lastInsightsSync,
  insightsSyncError,
  isAdmin,
}: {
  configured: boolean;
  insightsConfigured: boolean;
  dbConfigured: boolean;
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
  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const actionsBlocked = !dbConfigured;
  const anyPending = pendingSync || pendingInsights || pendingPurge;

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

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Facebook Lead Ads</span>
        <Badge variant={configured ? "success" : "warning"}>
          {configured ? "Đã cấu hình" : "Chưa có env"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Đồng bộ thủ công lead từ Graph API (FACEBOOK_ACCESS_TOKEN, FACEBOOK_PAGE_ID / FACEBOOK_PAGE_IDS).
      </p>

      {!dbConfigured ? (
        <p className="text-xs text-amber-800">Cần DATABASE_URL để lưu lead và lịch sử đồng bộ.</p>
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
            variant="default"
            disabled={anyPending || !configured || actionsBlocked}
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
        <p className="text-xs text-muted-foreground">Chỉ ADMIN mới chạy đồng bộ hoặc xóa lead mẫu.</p>
      )}

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent showClose={!pendingPurge}>
          <DialogHeader>
            <DialogTitle>Xóa lead mẫu?</DialogTitle>
            <DialogDescription>
              Thao tác này xóa mọi lead không có facebook_lead_id. Lead đồng bộ từ Facebook và danh mục
              showroom/phòng bán hàng không bị ảnh hưởng.
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
