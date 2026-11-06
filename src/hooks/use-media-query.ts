"use client";

import * as React from "react";

/**
 * Theo dõi media query đồng bộ, an toàn với SSR & React 19 concurrent rendering.
 * Trả về `false` trên server để khớp hydration ban đầu, sau đó cập nhật ngay trên client.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = React.useCallback(
    (onStoreChange: () => void) => {
      if (typeof window === "undefined") return () => {};
      const mql = window.matchMedia(query);
      mql.addEventListener("change", onStoreChange);
      return () => mql.removeEventListener("change", onStoreChange);
    },
    [query],
  );

  const getSnapshot = React.useCallback(() => {
    if (typeof window === "undefined") return false;
    return window.matchMedia(query).matches;
  }, [query]);

  const getServerSnapshot = React.useCallback(() => false, []);

  return React.useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** `true` trên màn hình điện thoại (`< 768px`, tương đương `max-md` của Tailwind). */
export function useIsMobile(): boolean {
  return useMediaQuery("(max-width: 767px)");
}
