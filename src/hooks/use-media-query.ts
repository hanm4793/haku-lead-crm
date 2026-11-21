"use client";

import * as React from "react";

import { subscribeMediaQuery } from "@/lib/pwa/environment";

/**
 * Theo dõi media query đồng bộ, an toàn với SSR, React 19 concurrent rendering
 * và tương thích ngược cả iOS Safari 12–13 (`addListener`) lẫn Safari 14+ (`addEventListener`).
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined" || !window.matchMedia) return () => {};
      const mql = window.matchMedia(query);
      return subscribeMediaQuery(mql, onStoreChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `true` trên màn hình điện thoại (`< 768px`, tương đương `max-md` của Tailwind). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
