"use client";

import * as React from "react";

const NowContext = React.createContext<string | null>(null);

/**
 * Mốc "hiện tại" do server cấp cho mỗi request.
 *
 * Trạng thái quá hạn được vẽ ở cả server (HTML đầu tiên) và client (lúc
 * hydrate). Nếu mỗi bên tự gọi `new Date()` thì về lý thuyết có lead rơi đúng
 * vào khoảng giữa hai thời điểm đó và gây lệch hydration, nên server truyền
 * xuống một mốc duy nhất cho cả hai bên dùng.
 */
export function NowProvider({ value, children }: { value: string; children: React.ReactNode }) {
  return <NowContext.Provider value={value}>{children}</NowContext.Provider>;
}

export function useNow(): Date {
  const iso = React.useContext(NowContext);
  return React.useMemo(() => (iso ? new Date(iso) : new Date()), [iso]);
}
