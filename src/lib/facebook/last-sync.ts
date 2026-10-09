import { and, desc, eq, like } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { metaSyncRuns } from "@/lib/db/schema";

import { syncScopeTag } from "./sync-scope";

export type LastSyncInfo = { at: string; status: string; message: string | null } | null;

/** Lần đồng bộ lead gần nhất của một dự án. Bỏ phần tag ở đầu message. */
export async function loadLastProjectSync(kind: "leads", projectId: string): Promise<LastSyncInfo> {
  const tag = syncScopeTag(projectId);
  const [row] = await getDb()
    .select({
      startedAt: metaSyncRuns.startedAt,
      status: metaSyncRuns.status,
      message: metaSyncRuns.message,
    })
    .from(metaSyncRuns)
    .where(and(eq(metaSyncRuns.kind, kind), like(metaSyncRuns.message, `${tag}%`)))
    .orderBy(desc(metaSyncRuns.startedAt))
    .limit(1);
  if (!row) return null;
  return {
    at: row.startedAt.toISOString(),
    status: row.status,
    message: row.message?.startsWith(tag) ? row.message.slice(tag.length) : row.message,
  };
}
