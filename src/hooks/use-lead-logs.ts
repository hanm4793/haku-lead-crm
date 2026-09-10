"use client";

import * as React from "react";

import type { ActivityLog } from "@/lib/types";

/**
 * Tải lịch sử hoạt động của lead đang mở.
 *
 * Lịch sử chỉ cần khi người dùng mở popup chi tiết, nên không nạp kèm danh sách
 * — tránh kéo về hàng nghìn dòng log không ai xem.
 */
export function useLeadLogs(leadId: string | null) {
  const [loaded, setLoaded] = React.useState<{
    leadId: string;
    logs: ActivityLog[];
    token: number;
  } | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!leadId) return;

    const controller = new AbortController();
    const token = reloadToken;

    fetch(`/api/leads/${leadId}/logs`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { logs: [] }))
      .then((data: { logs?: ActivityLog[] }) =>
        setLoaded({ leadId, logs: data.logs ?? [], token }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({ leadId, logs: [], token });
      });

    return () => controller.abort();
  }, [leadId, reloadToken]);

  const ready = Boolean(leadId) && loaded?.leadId === leadId && loaded.token === reloadToken;

  return {
    logs: ready ? loaded.logs : [],
    loading: Boolean(leadId) && !ready,
    reload: React.useCallback(() => setReloadToken((n) => n + 1), []),
  };
}
