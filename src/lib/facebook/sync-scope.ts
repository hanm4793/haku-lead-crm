/**
 * Lần đồng bộ theo dự án ghi `[p:<projectId>]` đầu `meta_sync_runs.message` để
 * lọc lịch sử theo dự án mà không cần thêm cột.
 */
export function syncScopeTag(projectId?: string): string {
  return projectId ? `[p:${projectId}] ` : "";
}
