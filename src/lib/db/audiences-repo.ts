import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import {
  deduplicateAudienceContacts,
  type AudienceBuildResult,
  type AudienceContact,
  type AudienceFanpageBreakdown,
  type RawAudienceLead,
} from "@/lib/audiences/customer-audience";
import { getDb } from "@/lib/db/client";
import {
  audienceSegments,
  facebookPages,
  leads,
  projects,
  type AudienceFilterConfig,
} from "@/lib/db/schema";
import {
  syncContactsToMetaCustomAudience,
  type SyncMetaAudienceResult,
} from "@/lib/facebook/custom-audiences";

export interface AudienceSegmentView {
  id: string;
  name: string;
  description: string | null;
  projectId: string | null;
  projectName: string | null;
  filters: AudienceFilterConfig;
  facebookAdAccountId: string | null;
  facebookAudienceId: string | null;
  lastSyncedAt: string | null;
  lastSyncCount: number;
  lastSyncStatus: "ok" | "error" | null;
  lastSyncMessage: string | null;
  createdAt: string;
  updatedAt: string;
  liveRawLeads: number;
  liveUniqueContacts: number;
  liveValidPhones: number;
  liveValidEmails: number;
}

export interface AudiencePreviewResult {
  stats: AudienceBuildResult["stats"];
  byFanpage: AudienceFanpageBreakdown[];
  sampleContacts: AudienceContact[];
}

let tableEnsured = false;

/**
 * Đảm bảo bảng `audience_segments` luôn tồn tại ngay cả khi môi trường
 * chưa chạy `drizzle-kit migrate` thủ công.
 */
export async function ensureAudienceSegmentsTable(): Promise<void> {
  if (tableEnsured) return;
  const db = getDb();
  await db.execute(sql`
    CREATE TABLE IF NOT EXISTS "audience_segments" (
      "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
      "name" text NOT NULL,
      "description" text,
      "project_id" uuid REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
      "filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
      "facebook_ad_account_id" text,
      "facebook_audience_id" text,
      "last_synced_at" timestamp with time zone,
      "last_sync_count" integer DEFAULT 0 NOT NULL,
      "last_sync_status" "meta_sync_status",
      "last_sync_message" text,
      "created_at" timestamp with time zone DEFAULT now() NOT NULL,
      "updated_at" timestamp with time zone DEFAULT now() NOT NULL
    );
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "audience_segments_project_idx" ON "audience_segments" USING btree ("project_id");
  `);
  await db.execute(sql`
    CREATE INDEX IF NOT EXISTS "audience_segments_created_at_idx" ON "audience_segments" USING btree ("created_at" DESC);
  `);
  tableEnsured = true;
}

function buildAudienceWhereConditions(
  projectId: string | null | undefined,
  filters: AudienceFilterConfig,
): SQL[] {
  const conds: SQL[] = [];

  if (projectId) {
    conds.push(eq(leads.projectId, projectId));
  }

  const pageIds = (filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (pageIds.length > 0) {
    conds.push(inArray(leads.facebookPageId, pageIds));
  }

  if (filters.categories && filters.categories.length > 0) {
    conds.push(inArray(leads.category, filters.categories));
  }

  if (filters.contactStatuses && filters.contactStatuses.length > 0) {
    conds.push(inArray(leads.contactStatus, filters.contactStatuses));
  }

  if (filters.failReasons && filters.failReasons.length > 0) {
    conds.push(inArray(leads.failReason, filters.failReasons));
  }

  if (filters.sources && filters.sources.length > 0) {
    conds.push(inArray(leads.source, filters.sources));
  }

  const brandIds = (filters.brandIds ?? []).filter(Boolean);
  if (brandIds.length > 0) {
    conds.push(inArray(leads.brandId, brandIds));
  }

  const productIds = (filters.productIds ?? []).filter(Boolean);
  if (productIds.length > 0) {
    conds.push(inArray(leads.productId, productIds));
  }

  const locationIds = (filters.locationIds ?? []).filter(Boolean);
  if (locationIds.length > 0) {
    conds.push(inArray(leads.locationId, locationIds));
  }

  if (filters.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) {
    const start = new Date(`${filters.dateFrom}T00:00:00.000+07:00`);
    if (!Number.isNaN(start.getTime())) {
      conds.push(gte(leads.createdAt, start));
    }
  }

  if (filters.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) {
    const end = new Date(`${filters.dateTo}T23:59:59.999+07:00`);
    if (!Number.isNaN(end.getTime())) {
      conds.push(lte(leads.createdAt, end));
    }
  }

  return conds;
}

/** Truy vấn danh sách lead thô khớp với bộ lọc của tệp khách hàng. */
export async function queryAudienceRawLeads(input: {
  projectId?: string | null;
  filters: AudienceFilterConfig;
}): Promise<RawAudienceLead[]> {
  const db = getDb();
  const conds = buildAudienceWhereConditions(input.projectId, input.filters);

  const rows = await db
    .select({
      id: leads.id,
      name: leads.name,
      phone: leads.phone,
      attrs: leads.attrs,
      category: leads.category,
      contactStatus: leads.contactStatus,
      failReason: leads.failReason,
      source: leads.source,
      facebookPageId: leads.facebookPageId,
      facebookPageName: facebookPages.name,
      facebookLeadId: leads.facebookLeadId,
      createdAt: leads.createdAt,
    })
    .from(leads)
    .leftJoin(facebookPages, eq(leads.facebookPageId, facebookPages.facebookPageId))
    .where(conds.length > 0 ? and(...conds) : undefined)
    .orderBy(desc(leads.createdAt));

  return rows;
}

/** Xây dựng dữ liệu đầy đủ (đã khử trùng lặp SĐT/Email) cho một bộ lọc tệp khách hàng. */
export async function buildAudienceContacts(input: {
  projectId?: string | null;
  filters: AudienceFilterConfig;
}): Promise<AudienceBuildResult> {
  const rawLeads = await queryAudienceRawLeads(input);
  return deduplicateAudienceContacts(rawLeads);
}

/** Xem trước thống kê tệp khách hàng + phân bổ theo từng Fanpage + 20 liên hệ mẫu. */
export async function previewAudienceSegment(input: {
  projectId?: string | null;
  filters: AudienceFilterConfig;
}): Promise<AudiencePreviewResult> {
  const result = await buildAudienceContacts(input);
  return {
    stats: result.stats,
    byFanpage: result.byFanpage,
    sampleContacts: result.contacts.slice(0, 20),
  };
}

/** Lấy danh sách các tệp khách hàng đã lưu kèm số lượng khách thực tế (live count). */
export async function listAudienceSegments(projectId?: string | null): Promise<AudienceSegmentView[]> {
  await ensureAudienceSegmentsTable();
  const db = getDb();

  const rows = await db
    .select({
      id: audienceSegments.id,
      name: audienceSegments.name,
      description: audienceSegments.description,
      projectId: audienceSegments.projectId,
      projectName: projects.name,
      filters: audienceSegments.filters,
      facebookAdAccountId: audienceSegments.facebookAdAccountId,
      facebookAudienceId: audienceSegments.facebookAudienceId,
      lastSyncedAt: audienceSegments.lastSyncedAt,
      lastSyncCount: audienceSegments.lastSyncCount,
      lastSyncStatus: audienceSegments.lastSyncStatus,
      lastSyncMessage: audienceSegments.lastSyncMessage,
      createdAt: audienceSegments.createdAt,
      updatedAt: audienceSegments.updatedAt,
    })
    .from(audienceSegments)
    .leftJoin(projects, eq(audienceSegments.projectId, projects.id))
    .where(projectId ? eq(audienceSegments.projectId, projectId) : undefined)
    .orderBy(desc(audienceSegments.createdAt));

  const views: AudienceSegmentView[] = await Promise.all(
    rows.map(async (row) => {
      const built = await buildAudienceContacts({
        projectId: row.projectId,
        filters: row.filters ?? {},
      }).catch(() => null);

      return {
        id: row.id,
        name: row.name,
        description: row.description,
        projectId: row.projectId,
        projectName: row.projectName ?? null,
        filters: row.filters ?? {},
        facebookAdAccountId: row.facebookAdAccountId,
        facebookAudienceId: row.facebookAudienceId,
        lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
        lastSyncCount: row.lastSyncCount,
        lastSyncStatus: row.lastSyncStatus ?? null,
        lastSyncMessage: row.lastSyncMessage ?? null,
        createdAt: row.createdAt.toISOString(),
        updatedAt: row.updatedAt.toISOString(),
        liveRawLeads: built?.stats.totalMatchedLeads ?? 0,
        liveUniqueContacts: built?.stats.uniqueContacts ?? 0,
        liveValidPhones: built?.stats.validPhones ?? 0,
        liveValidEmails: built?.stats.validEmails ?? 0,
      };
    }),
  );

  return views;
}

export async function getAudienceSegmentById(id: string) {
  await ensureAudienceSegmentsTable();
  const [row] = await getDb()
    .select()
    .from(audienceSegments)
    .where(eq(audienceSegments.id, id))
    .limit(1);
  return row ?? null;
}

/**
 * Tạo tệp khách hàng mới.
 * Hỗ trợ 2 chế độ:
 * - `merge`: Gộp tất cả các Fanpage được chọn (hoặc toàn bộ Dự án) vào 1 tệp chung.
 * - `split_by_page`: Tự động tách riêng mỗi Fanpage thành 1 tệp khách hàng độc lập.
 */
export async function createAudienceSegments(input: {
  name: string;
  description?: string | null;
  projectId: string | null;
  filters: AudienceFilterConfig;
  facebookAdAccountId?: string | null;
  mode?: "merge" | "split_by_page";
}): Promise<{ createdIds: string[]; count: number }> {
  await ensureAudienceSegmentsTable();
  const db = getDb();
  const mode = input.mode ?? "merge";
  const baseName = input.name.trim();
  if (!baseName) {
    throw new Error("Tên tệp khách hàng không được để trống.");
  }

  if (mode === "split_by_page") {
    let targetPageIds = (input.filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);

    // Nếu chưa chọn fanpage cụ thể nhưng chọn "Tách theo từng Fanpage", lấy toàn bộ fanpage đang bật của dự án
    if (targetPageIds.length === 0 && input.projectId) {
      const projPages = await db
        .select({ facebookPageId: facebookPages.facebookPageId })
        .from(facebookPages)
        .where(and(eq(facebookPages.projectId, input.projectId), eq(facebookPages.active, true)));
      targetPageIds = projPages.map((p) => p.facebookPageId);
    }

    if (targetPageIds.length > 0) {
      const pageRows = await db
        .select({
          facebookPageId: facebookPages.facebookPageId,
          name: facebookPages.name,
        })
        .from(facebookPages)
        .where(inArray(facebookPages.facebookPageId, targetPageIds));
      const nameByPageId = new Map(
        pageRows.map((p) => [p.facebookPageId, p.name?.trim() || p.facebookPageId]),
      );

      const createdIds: string[] = [];
      for (const pageId of targetPageIds) {
        const pageLabel = nameByPageId.get(pageId) ?? pageId;
        const segmentName = `${baseName} — ${pageLabel}`;
        const [inserted] = await db
          .insert(audienceSegments)
          .values({
            name: segmentName,
            description: input.description?.trim() || null,
            projectId: input.projectId,
            filters: {
              ...input.filters,
              facebookPageIds: [pageId],
            },
            facebookAdAccountId: input.facebookAdAccountId?.trim() || null,
          })
          .returning({ id: audienceSegments.id });
        if (inserted) createdIds.push(inserted.id);
      }

      return { createdIds, count: createdIds.length };
    }
  }

  // Mặc định: mode === "merge" (gộp toàn bộ fanpage đã chọn vào 1 tệp duy nhất)
  const [inserted] = await db
    .insert(audienceSegments)
    .values({
      name: baseName,
      description: input.description?.trim() || null,
      projectId: input.projectId,
      filters: {
        ...input.filters,
        facebookPageIds: (input.filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean),
      },
      facebookAdAccountId: input.facebookAdAccountId?.trim() || null,
    })
    .returning({ id: audienceSegments.id });

  if (!inserted) {
    throw new Error("Không thể lưu tệp khách hàng.");
  }

  return { createdIds: [inserted.id], count: 1 };
}

export async function updateAudienceSegment(
  id: string,
  patch: {
    name?: string;
    description?: string | null;
    projectId?: string | null;
    filters?: AudienceFilterConfig;
    facebookAdAccountId?: string | null;
  },
) {
  await ensureAudienceSegmentsTable();
  const db = getDb();
  const [updated] = await db
    .update(audienceSegments)
    .set({
      ...(patch.name !== undefined ? { name: patch.name.trim() } : {}),
      ...(patch.description !== undefined ? { description: patch.description?.trim() || null } : {}),
      ...(patch.projectId !== undefined ? { projectId: patch.projectId } : {}),
      ...(patch.filters !== undefined ? { filters: patch.filters } : {}),
      ...(patch.facebookAdAccountId !== undefined
        ? { facebookAdAccountId: patch.facebookAdAccountId?.trim() || null }
        : {}),
      updatedAt: new Date(),
    })
    .where(eq(audienceSegments.id, id))
    .returning();
  return updated ?? null;
}

export async function deleteAudienceSegment(id: string): Promise<void> {
  await ensureAudienceSegmentsTable();
  await getDb().delete(audienceSegments).where(eq(audienceSegments.id, id));
}

/**
 * Đồng bộ tệp khách hàng đã lưu lên Meta Custom Audience và cập nhật trạng thái vào DB.
 */
export async function syncAudienceSegmentToMeta(input: {
  segmentId: string;
  adAccountId?: string | null;
}): Promise<SyncMetaAudienceResult> {
  await ensureAudienceSegmentsTable();
  const db = getDb();
  const segment = await getAudienceSegmentById(input.segmentId);
  if (!segment) {
    throw new Error("Không tìm thấy tệp khách hàng.");
  }

  const targetAdAccount =
    input.adAccountId?.trim() || segment.facebookAdAccountId?.trim() || "";

  try {
    const built = await buildAudienceContacts({
      projectId: segment.projectId,
      filters: segment.filters ?? {},
    });

    const syncResult = await syncContactsToMetaCustomAudience({
      adAccountId: targetAdAccount,
      existingAudienceId: segment.facebookAudienceId,
      existingAdAccountId: segment.facebookAdAccountId,
      name: segment.name,
      description: segment.description,
      contacts: built.contacts,
    });

    const summaryMsg = `${syncResult.createdNewAudience ? "Đã tạo mới Audience" : "Đã cập nhật Audience"} (${syncResult.audienceId}) trên ${syncResult.adAccountId}: đẩy ${syncResult.uploadedCount} khách hàng (Meta nhận ${syncResult.numReceived}).`;

    await db
      .update(audienceSegments)
      .set({
        facebookAdAccountId: syncResult.adAccountId,
        facebookAudienceId: syncResult.audienceId,
        lastSyncedAt: new Date(),
        lastSyncCount: syncResult.uploadedCount,
        lastSyncStatus: "ok",
        lastSyncMessage: summaryMsg,
        updatedAt: new Date(),
      })
      .where(eq(audienceSegments.id, segment.id));

    return syncResult;
  } catch (error) {
    const message = error instanceof Error ? error.message : "Đồng bộ lên Facebook thất bại.";
    await db
      .update(audienceSegments)
      .set({
        ...(targetAdAccount ? { facebookAdAccountId: targetAdAccount } : {}),
        lastSyncedAt: new Date(),
        lastSyncStatus: "error",
        lastSyncMessage: message,
        updatedAt: new Date(),
      })
      .where(eq(audienceSegments.id, segment.id));
    throw error;
  }
}
