"use client";

import * as React from "react";
import Link from "next/link";
import { Clock, RefreshCw } from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

/**
 * Kết nối Facebook cấp hệ thống: báo trạng thái token / ad account và cấu hình tự động đồng bộ.
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
  const toast = useToast();
  const [syncing, setSyncing] = React.useState(false);
  const [autoSyncMinutes, setAutoSyncMinutes] = React.useState<string>(() => {
    if (typeof window === "undefined") return "30";
    return window.localStorage.getItem("semtop_auto_sync_minutes") ?? "30";
  });

  const handleAutoSyncChange = (value: string) => {
    setAutoSyncMinutes(value);
    if (typeof window !== "undefined") {
      window.localStorage.setItem("semtop_auto_sync_minutes", value);
    }
    toast.info(
      value === "0"
        ? "Đã tắt tự động đồng bộ"
        : `Đã bật tự động đồng bộ mỗi ${value} phút`,
    );
  };

  const handleFullSync = async () => {
    setSyncing(true);
    try {
      const res = await fetch("/api/cron/facebook-sync?kind=all&force=1", {
        method: "POST",
      });
      const data = (await res.json()) as {
        ok?: boolean;
        error?: string;
        leads?: { status: string; result?: { imported: number; updated: number }; error?: string };
        insights?: { status: string; result?: { imported: number; updated: number }; error?: string };
      };
      if (!res.ok || !data.ok) {
        toast.error("Đồng bộ thất bại", data.error ?? "Vui lòng kiểm tra cấu hình token.");
        return;
      }
      const leadMsg =
        data.leads?.status === "synced"
          ? `Lead: +${data.leads.result?.imported ?? 0} mới, ${data.leads.result?.updated ?? 0} cập nhật`
          : "Lead: bỏ qua";
      const insightMsg =
        data.insights?.status === "synced"
          ? `Insights: +${data.insights.result?.imported ?? 0} mới, ${data.insights.result?.updated ?? 0} cập nhật`
          : "Insights: bỏ qua";
      toast.success("Đã đồng bộ dữ liệu Facebook", `${leadMsg} · ${insightMsg}`);
    } catch {
      toast.error("Đồng bộ thất bại", "Không kết nối được máy chủ.");
    } finally {
      setSyncing(false);
    }
  };

  return (
    <div className="space-y-3 rounded-md border border-border/60 bg-muted/20 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="font-medium text-slate-800">Facebook (Lead Ads &amp; Marketing Insights)</span>
        {isAdmin && (
          <div className="flex flex-wrap items-center gap-2">
            <Select value={autoSyncMinutes} onValueChange={handleAutoSyncChange}>
              <SelectTrigger className="h-8 w-[175px] gap-1.5 bg-card text-xs">
                <Clock className="size-3.5 shrink-0 text-primary" />
                <SelectValue placeholder="Tự động đồng bộ" />
              </SelectTrigger>
              <SelectContent align="end">
                <SelectItem value="0" className="text-xs">
                  Tự động: Tắt
                </SelectItem>
                <SelectItem value="15" className="text-xs">
                  Tự động: Mỗi 15 phút
                </SelectItem>
                <SelectItem value="30" className="text-xs">
                  Tự động: Mỗi 30 phút
                </SelectItem>
                <SelectItem value="60" className="text-xs">
                  Tự động: Mỗi 1 giờ
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 bg-card text-xs"
              disabled={syncing || !tokenConfigured}
              onClick={() => void handleFullSync()}
            >
              <RefreshCw className={cn("size-3.5", syncing && "animate-spin")} />
              {syncing ? "Đang đồng bộ…" : "Đồng bộ toàn bộ ngay"}
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Access token (FACEBOOK_ACCESS_TOKEN)</span>
          <Badge variant={tokenConfigured ? "success" : "warning"}>
            {tokenConfigured ? "Đã cấu hình" : "Thiếu token"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Ad account (FACEBOOK_AD_ACCOUNT_ID)</span>
          <Badge variant={insightsConfigured ? "success" : "warning"}>
            {insightsConfigured ? "Đã cấu hình" : "Thiếu"}
          </Badge>
        </div>
        <div className="flex items-center justify-between">
          <span className="text-muted-foreground">Endpoint Cron tự động (Server)</span>
          <code className="rounded bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-700">
            /api/cron/facebook-sync?kind=all
          </code>
        </div>
      </div>

      <p className="text-xs text-muted-foreground">
        Hệ thống hỗ trợ tự động đồng bộ định kỳ ngay khi mở web và qua Cron Server (`vercel.json` / `CRON_SECRET`). Cấu hình Fanpage theo từng dự án tại{" "}
        <Link href="/projects" className="font-medium text-primary underline-offset-2 hover:underline">
          Dự án → chi tiết → tab Fanpage
        </Link>
        .
      </p>

      {!isAdmin && (
        <p className="text-xs text-muted-foreground">Chỉ super admin mới quản lý đồng bộ.</p>
      )}
    </div>
  );
}

