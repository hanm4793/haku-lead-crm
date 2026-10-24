"use client";

import * as React from "react";

import type { ActivityLog, Lead } from "@/lib/types";

/**
 * Tải chi tiết đầy đủ của lead (gồm attrs JSONB) và lịch sử hoạt động khi mở popup.
 *
 * Dữ liệu chi tiết nặng (attrs form, lịch sử) chỉ cần khi người dùng mở popup
 * chi tiết, nên tách khỏi danh sách để API danh sách nhẹ và nhanh tối đa.
 */
export function useLeadLogs(leadId: string | null) {
  const [loaded, setLoaded] = React.useState<{
    leadId: string;
    lead: Lead | null;
    logs: ActivityLog[];
    token: number;
  } | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  React.useEffect(() => {
    if (!leadId) return;

    const controller = new AbortController();
    const token = reloadToken;

    fetch(`/api/leads/${leadId}/logs`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : { lead: null, logs: [] }))
      .then((data: { lead?: Lead | null; logs?: ActivityLog[] }) =>
        setLoaded({ leadId, lead: data.lead ?? null, logs: data.logs ?? [], token }),
      )
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        setLoaded({ leadId, lead: null, logs: [], token });
      });

    return () => controller.abort();
  }, [leadId, reloadToken]);

  const ready = Boolean(leadId) && loaded?.leadId === leadId && loaded.token === reloadToken;

  return {
    detailLead: ready ? loaded.lead : null,
    logs: ready ? loaded.logs : [],
    loading: Boolean(leadId) && !ready,
    reload: React.useCallback(() => setReloadToken((n) => n + 1), []),
  };
}
