import { and, desc, eq, isNotNull, like, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { leads, metaSyncRuns } from "@/lib/db/schema";

import { syncScopeTag } from "./sync-scope";

export type LastSyncInfo = { at: string; status: string; message: string | null } | null;

/** Lần đồng bộ lead gần nhất của một dự án. Bỏ phần tag ở đầu message. */
export async function loadLastProjectSync(kind: "leads", projectId: string): Promise<LastSyncInfo> {
  const tag = syncScopeTag(projectId);
  const [row] = await getDb()
    .select({
      startedAt: metaSyncRuns.startedAt,
      finishedAt: metaSyncRuns.finishedAt,
      status: metaSyncRuns.status,
      message: metaSyncRuns.message,
    })
    .from(metaSyncRuns)
    .where(
      and(
        eq(metaSyncRuns.kind, kind),
        isNotNull(metaSyncRuns.finishedAt),
        like(metaSyncRuns.message, `${tag}%`),
      ),
    )
    .orderBy(desc(metaSyncRuns.startedAt))
    .limit(1);
  if (!row) return null;
  return {
    at: (row.finishedAt ?? row.startedAt).toISOString(),
    status: row.status,
    message: row.message?.startsWith(tag) ? row.message.slice(tag.length) : row.message,
  };
}

/**
 * Thời điểm dữ liệu CRM được cập nhật mới nhất (lấy mốc mới nhất giữa lần đồng bộ
 * Facebook hoàn tất thành công gần nhất và lần tạo/cập nhật lead gần nhất).
 */
export async function getLatestDataTimestamp(projectId?: string | null): Promise<string | null> {
  try {
    const db = getDb();
    const [[syncRow], [leadRow]] = await Promise.all([
      db
        .select({
          at: sql<Date | null>`max(${metaSyncRuns.finishedAt})`,
        })
        .from(metaSyncRuns)
        .where(and(eq(metaSyncRuns.status, "ok"), isNotNull(metaSyncRuns.finishedAt))),
      projectId
        ? db
            .select({
              at: sql<Date | null>`max(greatest(${leads.updatedAt}, ${leads.createdAt}))`,
            })
            .from(leads)
            .where(eq(leads.projectId, projectId))
        : db
            .select({
              at: sql<Date | null>`max(greatest(${leads.updatedAt}, ${leads.createdAt}))`,
            })
            .from(leads),
    ]);

    const t1 = syncRow?.at ? new Date(syncRow.at).getTime() : 0;
    const t2 = leadRow?.at ? new Date(leadRow.at).getTime() : 0;
    const maxMs = Math.max(t1, t2);
    return maxMs > 0 ? new Date(maxMs).toISOString() : null;
  } catch {
    return null;
  }
}
