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
    const leadMaxExpr = projectId
      ? sql`(select max(greatest(${leads.updatedAt}, ${leads.createdAt})) from ${leads} where ${leads.projectId} = ${projectId})`
      : sql`(select max(greatest(${leads.updatedAt}, ${leads.createdAt})) from ${leads})`;
    const syncMaxExpr = sql`(select max(${metaSyncRuns.finishedAt}) from ${metaSyncRuns} where ${metaSyncRuns.status} = 'ok' and ${metaSyncRuns.finishedAt} is not null)`;
    const [row] = await db.execute<{ at: Date | string | null }>(
      sql`select greatest(${syncMaxExpr}, ${leadMaxExpr}) as at`,
    );
    const maxMs = row?.at ? new Date(row.at).getTime() : 0;
    return maxMs > 0 ? new Date(maxMs).toISOString() : null;
  } catch {
    return null;
  }
}
