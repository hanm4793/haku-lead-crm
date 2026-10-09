"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { purgeSampleLeadsAction } from "@/app/settings/facebook-actions";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * Kết nối Facebook cấp hệ thống: chỉ báo trạng thái token / ad account (đặt trong env).
 * Fanpage và đồng bộ lead / Insights nằm trong từng dự án.
 */
export function FacebookSyncPanel({
  tokenConfigured,
  insightsConfigured,
  dbConfigured,
  isAdmin,
}: {
  tokenConfigured: boolean;
  insightsConfigured: boolean;
  dbConfigured: boolean;
  isAdmin: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [purgeOpen, setPurgeOpen] = React.useState(false);
  const [pendingPurge, setPendingPurge] = React.useState(false);

  async function runPurge() {
    setPurgeOpen(false);
    setPendingPurge(true);
    try {
      const outcome = await purgeSampleLeadsAction();
      if (!outcome.ok) {
        toast.error("Không xóa được lead mẫu", outcome.error);
        return;
      }
      toast.success(`Đã xóa ${outcome.deleted} lead mẫu.`, "Chỉ xóa lead không có facebook_lead_id.");
      router.refresh();
    } finally {
      setPendingPurge(false);
    }
  }

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Facebook</span>
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Access token (FACEBOOK_ACCESS_TOKEN)</span>
          <Badge variant={tokenConfigured ? "success" : "warning"}>{tokenConfigured ? "Đã cấu hình" : "Thiếu token"}</Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Ad account (FACEBOOK_AD_ACCOUNT_ID)</span>
          <Badge variant={insightsConfigured ? "success" : "warning"}>
            {insightsConfigured ? "Đã cấu hình" : "Thiếu"}
          </Badge>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Token và ad account dùng chung cả hệ thống. Fanpage và đồng bộ lead nằm ở{" "}
        <Link href="/projects" className="font-medium text-primary underline-offset-2 hover:underline">
          Dự án → chi tiết → tab Fanpage
        </Link>
        . Đồng bộ Insights ở màn Marketing.
      </p>

      {isAdmin ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border/60 pt-3">
          <Button
            type="button"
            size="sm"
            variant="outline"
            disabled={pendingPurge || !dbConfigured}
            onClick={() => setPurgeOpen(true)}
          >
            {pendingPurge ? "Đang xóa…" : "Xóa lead mẫu"}
          </Button>
          <span className="text-xs text-muted-foreground">Xóa mọi lead không có facebook_lead_id, ở mọi dự án.</span>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">Chỉ super admin mới quản lý đồng bộ.</p>
      )}

      <Dialog open={purgeOpen} onOpenChange={setPurgeOpen}>
        <DialogContent showClose={!pendingPurge}>
          <DialogHeader>
            <DialogTitle>Xóa lead mẫu?</DialogTitle>
            <DialogDescription>
              Xóa mọi lead không có facebook_lead_id ở tất cả dự án. Lead Facebook và danh mục không bị ảnh hưởng.
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
