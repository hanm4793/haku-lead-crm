"use client";

import * as React from "react";

import type { LeadPage } from "@/lib/db/leads-repo";
import type { LeadSearchInput } from "@/lib/leads/query";
import type { Lead } from "@/lib/types";

export interface UseLeadPageResult {
  data: LeadPage;
  loading: boolean;
  error: string | null;
  /** Sửa tại chỗ vài hàng trên trang hiện tại, trả về hàm hoàn tác. */
  patchRows: (patches: { id: string; patch: Partial<Lead> }[]) => () => void;
  refetch: () => void;
}

/**
 * Đồng bộ trang danh sách với server mỗi khi bộ lọc, sắp xếp hay phân trang đổi.
 *
 * Lần render đầu dùng luôn dữ liệu server component đã lấy sẵn, trừ khi bộ lọc
 * trong store khác với bộ lọc server đã dùng — trường hợp này xảy ra khi trợ lý
 * AI áp bộ lọc rồi điều hướng sang trang danh sách.
 */
export function useLeadPage(
  initialData: LeadPage,
  initialRequest: LeadSearchInput,
  request: LeadSearchInput,
): UseLeadPageResult {
  const [data, setData] = React.useState(initialData);
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [reloadToken, setReloadToken] = React.useState(0);

  const key = JSON.stringify(request);
  const initialKey = React.useMemo(() => JSON.stringify(initialRequest), [initialRequest]);
  const firstRun = React.useRef(true);

  React.useEffect(() => {
    const isFirstRun = firstRun.current;
    firstRun.current = false;
    if (isFirstRun && key === initialKey && reloadToken === 0) return;

    const controller = new AbortController();
    setLoading(true);

    fetch("/api/leads/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: key,
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error((await response.json()).error ?? "Không tải được danh sách.");
        return response.json() as Promise<LeadPage>;
      })
      .then((next) => {
        setData(next);
        setError(null);
      })
      .catch((e: unknown) => {
        if (e instanceof DOMException && e.name === "AbortError") return;
        setError(e instanceof Error ? e.message : "Không tải được danh sách.");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [key, initialKey, reloadToken]);

  // Ảnh chụp dữ liệu hiện tại để hoàn tác được khi server từ chối thay đổi.
  const snapshot = React.useRef(data);
  React.useEffect(() => {
    snapshot.current = data;
  }, [data]);

  const patchRows = React.useCallback((patches: { id: string; patch: Partial<Lead> }[]) => {
    const before = snapshot.current;

    setData((current) => {
      const byId = new Map(patches.map((p) => [p.id, p.patch]));
      return {
        ...current,
        rows: current.rows.map((row) => {
          const patch = byId.get(row.id);
          return patch ? { ...row, ...patch } : row;
        }),
      };
    });

    return () => setData(before);
  }, []);

  const refetch = React.useCallback(() => setReloadToken((n) => n + 1), []);

  return { data, loading, error, patchRows, refetch };
}
