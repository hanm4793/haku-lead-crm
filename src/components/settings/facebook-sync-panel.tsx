"use client";

import * as React from "react";
import { useRouter } from "next/navigation";

import {
  purgeSampleLeadsAction,
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

export type LastLeadSyncInfo = {
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
  const [label, setLabel] = React.useState<string | null>(null);

  React.useEffect(() => {
    setLabel(formatSyncTime(iso));
  }, [iso]);

  return <span className="font-medium">{label ?? "…"}</span>;
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

export function FacebookSyncPanel({
  configured,
  dbConfigured,
  lastLeadSync,
  lastSyncError,
  isAdmin,
}: {
  configured: boolean;
  dbConfigured: boolean;
  lastLeadSync: LastLeadSyncInfo;
  lastSyncError: string | null;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [pendingSync, setPendingSync] = React.useState(false);
  const [pendingPurge, setPendingPurge] = React.useState(false);
  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const [actionFeedback, setActionFeedback] = React.useState<string | null>(null);
  const [actionError, setActionError] = React.useState<string | null>(null);

  const actionsBlocked = !dbConfigured;
  const anyPending = pendingSync || pendingPurge;

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

  return (
    <div className="space-y-2 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Facebook Lead Ads</span>
        <Badge variant={configured ? "success" : "warning"}>
          {configured ? "Đã cấu hình" : "Chưa có env"}
        </Badge>
      </div>

      <p className="text-xs text-muted-foreground">
        Đồng bộ thủ công lead từ Graph API (FACEBOOK_ACCESS_TOKEN, FACEBOOK_PAGE_ID).
      </p>

      {!dbConfigured ? (
        <p className="text-xs text-amber-800">Cần DATABASE_URL để lưu lead và lịch sử đồng bộ.</p>
      ) : null}

      {lastSyncError ? (
        <p className="text-xs text-rose-700" role="alert">
          Không tải được lịch sử đồng bộ: {lastSyncError}
        </p>
      ) : null}

      {lastLeadSync ? (
        <div className="space-y-1 text-[13px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Lần đồng bộ gần nhất</span>
            <SyncTimeLabel iso={lastLeadSync.at} />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-muted-foreground">Kết quả</span>
            {statusBadge(lastLeadSync.status)}
          </div>
          {lastLeadSync.message ? (
            <p className="text-xs text-muted-foreground">{lastLeadSync.message}</p>
          ) : null}
        </div>
      ) : lastSyncError ? null : dbConfigured ? (
        <p className="text-xs text-muted-foreground">Chưa có lịch sử đồng bộ lead.</p>
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
