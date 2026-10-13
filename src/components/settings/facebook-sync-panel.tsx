"use client";

import Link from "next/link";

import { Badge } from "@/components/ui/badge";

/**
 * Kết nối Facebook cấp hệ thống: chỉ báo trạng thái token / ad account (đặt trong env).
 * Fanpage và đồng bộ lead / Insights nằm trong từng dự án.
 */
export function FacebookSyncPanel({
  tokenConfigured,
  insightsConfigured,
  isAdmin,
}: {
  tokenConfigured: boolean;
  insightsConfigured: boolean;
  dbConfigured?: boolean;
  isAdmin: boolean;
}) {
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

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">Chỉ super admin mới quản lý đồng bộ.</p>
      )}
    </div>
  );
}
