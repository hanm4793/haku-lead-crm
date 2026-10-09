"use client";

import * as React from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import { syncFacebookLeadsAction } from "@/app/settings/facebook-actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useToast } from "@/components/providers/toast-provider";

export type LastSyncInfo = { at: string; status: string; message: string | null } | null;

function formatTime(iso: string): string {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString("vi-VN", { dateStyle: "short", timeStyle: "short" });
}

function LastSync({ label, sync }: { label: string; sync: LastSyncInfo }) {
  if (!sync) return <span className="text-muted-foreground">{label}: chưa đồng bộ</span>;
  return (
    <span className="inline-flex items-center gap-1.5 text-muted-foreground" title={sync.message ?? undefined}>
      {label}:
      <span className="font-medium text-slate-700" suppressHydrationWarning>
        {formatTime(sync.at)}
      </span>
      <Badge variant={sync.status === "ok" ? "success" : "danger"}>{sync.status === "ok" ? "Thành công" : "Lỗi"}</Badge>
    </span>
  );
}

/**
 * Đồng bộ lead của riêng dự án: chỉ quét các fanpage đang bật của dự án.
 * Insights quảng cáo tính theo ad account nên nằm ở màn Marketing.
 */
export function ProjectFacebookSync({
  projectId,
  tokenConfigured,
  activePageCount,
  lastLeadSync,
}: {
  projectId: string;
  tokenConfigured: boolean;
  activePageCount: number;
  lastLeadSync: LastSyncInfo;
}) {
  const router = useRouter();
  const toast = useToast();
  const [running, setRunning] = React.useState(false);

  const run = async () => {
    setRunning(true);
    try {
      const outcome = await syncFacebookLeadsAction({ projectId });
      if (!outcome.ok) {
        toast.error("Đồng bộ lead thất bại", outcome.error);
        return;
      }
      const { imported, updated, skipped, errors, message } = outcome.result;
      const detail = `${message} (mới: ${imported}, cập nhật: ${updated}, bỏ qua: ${skipped}, lỗi: ${errors})`;
      if (errors > 0) toast.warning("Đồng bộ lead xong nhưng có lỗi", detail);
      else toast.success("Đã đồng bộ lead", detail);
      router.refresh();
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-2 rounded-xl border border-border bg-card px-3 py-2.5 text-[13px] shadow-xs">
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-medium text-slate-800">Đồng bộ lead Facebook</span>
        <Badge variant={tokenConfigured ? "success" : "warning"}>{tokenConfigured ? "Token OK" : "Thiếu token"}</Badge>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button
            size="sm"
            className="gap-1.5"
            disabled={running || !tokenConfigured || activePageCount === 0}
            title={activePageCount === 0 ? "Dự án chưa có fanpage đang bật" : undefined}
            onClick={() => void run()}
          >
            {running ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Đồng bộ lead
          </Button>
        </div>
      </div>

      <div className="text-[12px]">
        <LastSync label="Lần đồng bộ gần nhất" sync={lastLeadSync} />
      </div>

    </div>
  );
}
