import { and, desc, eq, gte, inArray, lte, sql, type SQL } from "drizzle-orm";

import {
  deduplicateAudienceContacts,
  ensureCrmPrefix,
  stripCrmPrefix,
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
  metaAdInsights,
  projects,
  type AudienceFilterConfig,
} from "@/lib/db/schema";
import {
  fetchMetaDemographicPersona,
  syncContactsToMetaCustomAudience,
  type FanpagePersonaAnalysis,
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

const globalForAudiences = globalThis as unknown as {
  __audienceSegmentsTableEnsured?: boolean;
};

/**
 * Đảm bảo bảng `audience_segments` luôn tồn tại ngay cả khi môi trường
 * chưa chạy `drizzle-kit migrate` thủ công.
 */
export async function ensureAudienceSegmentsTable(): Promise<void> {
  if (globalForAudiences.__audienceSegmentsTableEnsured) return;
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
    CREATE INDEX IF NOT EXISTS "audience_segments_project_idx" ON "audience_segments" USING btree ("project_id");
    CREATE INDEX IF NOT EXISTS "audience_segments_created_at_idx" ON "audience_segments" USING btree ("created_at" DESC);
  `);
  globalForAudiences.__audienceSegmentsTableEnsured = true;
}

function buildAudienceWhereConditions(
  projectId: string | null | undefined,
  filters: AudienceFilterConfig,
): SQL[] {
  const conds: SQL[] = [];

  const filterProjectIds = (filters.projectIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (filterProjectIds.length > 0) {
    conds.push(inArray(leads.projectId, filterProjectIds));
  } else if (projectId) {
    conds.push(eq(leads.projectId, projectId));
  }

  const pageIds = (filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (pageIds.length > 0) {
    conds.push(inArray(leads.facebookPageId, pageIds));
  }

  const campaigns = (filters.campaigns ?? []).map((c) => c.trim()).filter(Boolean);
  if (campaigns.length > 0) {
    conds.push(inArray(leads.campaign, campaigns));
  }

  if (filters.channelDetails && filters.channelDetails.length > 0) {
    conds.push(inArray(leads.channelDetail, filters.channelDetails));
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

interface FilterableLeadRow extends RawAudienceLead {
  projectId: string | null;
  campaign: string | null;
  channelDetail: (typeof leads.$inferSelect)["channelDetail"];
  brandId: string | null;
  productId: string | null;
  locationId: string | null;
}

function matchesAudienceFiltersInMemory(
  lead: FilterableLeadRow,
  projectId: string | null | undefined,
  filters: AudienceFilterConfig,
): boolean {
  const filterProjectIds = (filters.projectIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (filterProjectIds.length > 0) {
    if (!lead.projectId || !filterProjectIds.includes(lead.projectId)) return false;
  } else if (projectId) {
    if (lead.projectId !== projectId) return false;
  }

  const pageIds = (filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);
  if (pageIds.length > 0) {
    if (!lead.facebookPageId || !pageIds.includes(lead.facebookPageId)) return false;
  }

  const campaigns = (filters.campaigns ?? []).map((c) => c.trim()).filter(Boolean);
  if (campaigns.length > 0) {
    if (!lead.campaign || !campaigns.includes(lead.campaign)) return false;
  }

  if (filters.channelDetails && filters.channelDetails.length > 0) {
    if (!lead.channelDetail || !filters.channelDetails.includes(lead.channelDetail)) return false;
  }

  if (filters.categories && filters.categories.length > 0) {
    if (!filters.categories.includes(lead.category)) return false;
  }

  if (filters.contactStatuses && filters.contactStatuses.length > 0) {
    if (!filters.contactStatuses.includes(lead.contactStatus)) return false;
  }

  if (filters.failReasons && filters.failReasons.length > 0) {
    if (!lead.failReason || !filters.failReasons.includes(lead.failReason)) return false;
  }

  if (filters.sources && filters.sources.length > 0) {
    if (!filters.sources.includes(lead.source)) return false;
  }

  const brandIds = (filters.brandIds ?? []).filter(Boolean);
  if (brandIds.length > 0) {
    if (!lead.brandId || !brandIds.includes(lead.brandId)) return false;
  }

  const productIds = (filters.productIds ?? []).filter(Boolean);
  if (productIds.length > 0) {
    if (!lead.productId || !productIds.includes(lead.productId)) return false;
  }

  const locationIds = (filters.locationIds ?? []).filter(Boolean);
  if (locationIds.length > 0) {
    if (!lead.locationId || !locationIds.includes(lead.locationId)) return false;
  }

  if (filters.dateFrom && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateFrom)) {
    const start = new Date(`${filters.dateFrom}T00:00:00.000+07:00`);
    if (!Number.isNaN(start.getTime()) && lead.createdAt < start) return false;
  }

  if (filters.dateTo && /^\d{4}-\d{2}-\d{2}$/.test(filters.dateTo)) {
    const end = new Date(`${filters.dateTo}T23:59:59.999+07:00`);
    if (!Number.isNaN(end.getTime()) && lead.createdAt > end) return false;
  }

  return true;
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

  if (rows.length === 0) return [];

  // Chỉ tải toàn bộ lead 1 lần duy nhất thay vì chạy N câu query cho N tệp KH.
  const allLeadRows: FilterableLeadRow[] = await db
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
      facebookPageName: sql<string | null>`null`,
      facebookLeadId: leads.facebookLeadId,
      createdAt: leads.createdAt,
      projectId: leads.projectId,
      campaign: leads.campaign,
      channelDetail: leads.channelDetail,
      brandId: leads.brandId,
      productId: leads.productId,
      locationId: leads.locationId,
    })
    .from(leads)
    .orderBy(desc(leads.createdAt))
    .catch(() => []);

  return rows.map((row) => {
    const filters = row.filters ?? {};
    const matchedLeads = allLeadRows.filter((lead) =>
      matchesAudienceFiltersInMemory(lead, row.projectId, filters),
    );
    const built = deduplicateAudienceContacts(matchedLeads);

    return {
      id: row.id,
      name: row.name,
      description: row.description,
      projectId: row.projectId,
      projectName: row.projectName ?? null,
      filters,
      facebookAdAccountId: row.facebookAdAccountId,
      facebookAudienceId: row.facebookAudienceId,
      lastSyncedAt: row.lastSyncedAt ? row.lastSyncedAt.toISOString() : null,
      lastSyncCount: row.lastSyncCount,
      lastSyncStatus: row.lastSyncStatus ?? null,
      lastSyncMessage: row.lastSyncMessage ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
      liveRawLeads: built.stats.totalMatchedLeads,
      liveUniqueContacts: built.stats.uniqueContacts,
      liveValidPhones: built.stats.validPhones,
      liveValidEmails: built.stats.validEmails,
    };
  });
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
 * Tạo tệp khách hàng mới (Luôn gắn prefix `CRM- `).
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
  const rawName = stripCrmPrefix(input.name);
  if (!rawName) {
    throw new Error("Tên tệp khách hàng không được để trống.");
  }
  const baseName = ensureCrmPrefix(rawName);

  if (mode === "split_by_page") {
    let targetPageIds = (input.filters.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);
    const filterProjectIds = (input.filters.projectIds ?? []).map((id) => id.trim()).filter(Boolean);

    // Nếu chưa chọn fanpage cụ thể nhưng chọn "Tách theo từng Fanpage", lấy toàn bộ fanpage đang bật của các dự án đã chọn
    if (targetPageIds.length === 0) {
      const projPages = await db
        .select({ facebookPageId: facebookPages.facebookPageId })
        .from(facebookPages)
        .where(
          filterProjectIds.length > 0
            ? and(inArray(facebookPages.projectId, filterProjectIds), eq(facebookPages.active, true))
            : input.projectId
              ? and(eq(facebookPages.projectId, input.projectId), eq(facebookPages.active, true))
              : eq(facebookPages.active, true),
        );
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
        const segmentName = ensureCrmPrefix(`${rawName} — ${pageLabel}`);

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
      ...(patch.name !== undefined ? { name: ensureCrmPrefix(patch.name) } : {}),
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
 * Tạo mới Tệp Khách Hàng (`CRM- ...`) từ dữ liệu khách hàng đã lọc trên CRM và đẩy lên Meta Ads.
 * QUY TẮC: Luôn tạo mới với prefix `CRM- `, tuyệt đối không ghi đè tệp cũ và không tự sinh Lookalike/Chân dung.
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

    let targetPageIds = (segment.filters?.facebookPageIds ?? []).map((id) => id.trim()).filter(Boolean);
    const filterProjectIds = (segment.filters?.projectIds ?? []).map((id) => id.trim()).filter(Boolean);
    if (targetPageIds.length === 0) {
      if (filterProjectIds.length > 0) {
        const projPages = await db
          .select({ facebookPageId: facebookPages.facebookPageId })
          .from(facebookPages)
          .where(and(inArray(facebookPages.projectId, filterProjectIds), eq(facebookPages.active, true)));
        targetPageIds = projPages.map((p) => p.facebookPageId);
      } else if (segment.projectId) {
        const projPages = await db
          .select({ facebookPageId: facebookPages.facebookPageId })
          .from(facebookPages)
          .where(and(eq(facebookPages.projectId, segment.projectId), eq(facebookPages.active, true)));
        targetPageIds = projPages.map((p) => p.facebookPageId);
      }
    }

    // Nếu tệp này đã từng đẩy trước đó, gắn thêm nhãn thời gian ngắn để tệp mới trên Meta không trùng tên với tệp cũ
    const previousItems = segment.filters?.createdMetaItems ?? [];
    let effectiveBaseName = ensureCrmPrefix(segment.name);
    if (segment.facebookAudienceId || previousItems.length > 0) {
      const now = new Date();
      const pad = (n: number) => String(n).padStart(2, "0");
      const timeTag = `${pad(now.getDate())}/${pad(now.getMonth() + 1)} ${pad(now.getHours())}:${pad(now.getMinutes())}`;
      effectiveBaseName = `${ensureCrmPrefix(segment.name)} (${timeTag})`;
    }

    const syncResult = await syncContactsToMetaCustomAudience({
      adAccountId: targetAdAccount,
      name: effectiveBaseName,
      description: segment.description,
      contacts: built.contacts,
      pageIds: targetPageIds,
    });

    const newItems = syncResult.createdItems ?? [];
    const summaryMsg = `Đã đồng bộ tệp ${effectiveBaseName} (${syncResult.uploadedCount} khách hàng) lên TKQC ${syncResult.adAccountId}.`;

    const mergedFilters: AudienceFilterConfig = {
      ...(segment.filters ?? {}),
      createdMetaItems: [...newItems, ...previousItems].slice(0, 30),
    };

    await db
      .update(audienceSegments)
      .set({
        name: ensureCrmPrefix(segment.name),
        filters: mergedFilters,
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

export interface AudienceCampaignOption {
  name: string;
  count: number;
  pageIds: string[];
  projectIds: string[];
  countsByPage?: Record<string, number>;
}

/**
 * Lấy danh sách các Chiến dịch quảng cáo (`leads.campaign` & `meta_ad_insights.campaign_name`)
 * gắn với từng Fanpage (`facebook_page_id` / `page_id`) và Dự án (`project_id`)
 * để khi lọc theo Fanpage thì danh sách chiến dịch chỉ hiển thị các chiến dịch thuộc Fanpage đó.
 */
export async function listAudienceCampaignOptions(): Promise<
  AudienceCampaignOption[]
> {
  const db = getDb();

  const [leadRows, insightRows] = await Promise.all([
    db
      .select({
        campaign: leads.campaign,
        pageId: leads.facebookPageId,
        projectId: leads.projectId,
        count: sql<number>`count(*)::int`,
      })
      .from(leads)
      .where(sql`${leads.campaign} IS NOT NULL AND btrim(${leads.campaign}) <> ''`)
      .groupBy(leads.campaign, leads.facebookPageId, leads.projectId),
    db
      .select({
        campaign: metaAdInsights.campaignName,
        pageId: metaAdInsights.pageId,
        projectId: facebookPages.projectId,
      })
      .from(metaAdInsights)
      .leftJoin(
        facebookPages,
        eq(metaAdInsights.pageId, facebookPages.facebookPageId),
      )
      .where(
        and(
          eq(metaAdInsights.level, "ad"),
          sql`${metaAdInsights.campaignName} IS NOT NULL AND btrim(${metaAdInsights.campaignName}) <> ''`,
        ),
      )
      .groupBy(
        metaAdInsights.campaignName,
        metaAdInsights.pageId,
        facebookPages.projectId,
      ),
  ]);

  const byName = new Map<
    string,
    {
      name: string;
      count: number;
      pageIds: Set<string>;
      projectIds: Set<string>;
      countsByPage: Record<string, number>;
    }
  >();

  const ensureEntry = (rawName: string) => {
    const name = rawName.trim();
    let entry = byName.get(name);
    if (!entry) {
      entry = {
        name,
        count: 0,
        pageIds: new Set<string>(),
        projectIds: new Set<string>(),
        countsByPage: {},
      };
      byName.set(name, entry);
    }
    return entry;
  };

  for (const r of leadRows) {
    const name = (r.campaign ?? "").trim();
    if (!name) continue;
    const entry = ensureEntry(name);
    const cnt = Number(r.count) || 0;
    entry.count += cnt;
    const pageId = (r.pageId ?? "").trim();
    if (pageId) {
      entry.pageIds.add(pageId);
      entry.countsByPage[pageId] = (entry.countsByPage[pageId] ?? 0) + cnt;
    }
    const projectId = (r.projectId ?? "").trim();
    if (projectId) {
      entry.projectIds.add(projectId);
    }
  }

  for (const r of insightRows) {
    const name = (r.campaign ?? "").trim();
    if (!name) continue;
    const entry = ensureEntry(name);
    const pageId = (r.pageId ?? "").trim();
    if (pageId) {
      entry.pageIds.add(pageId);
    }
    const projectId = (r.projectId ?? "").trim();
    if (projectId) {
      entry.projectIds.add(projectId);
    }
  }

  return Array.from(byName.values())
    .map((entry) => ({
      name: entry.name,
      count: entry.count,
      pageIds: Array.from(entry.pageIds),
      projectIds: Array.from(entry.projectIds),
      countsByPage: entry.countsByPage,
    }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "vi"))
    .slice(0, 300);
}

/**
 * Phân tích Chân dung Khách hàng (Độ tuổi × Giới tính × Tỉnh/Thành × Vị trí hiển thị)
 * từ các chiến dịch Meta Ads của những Fanpage đang chọn (hoặc toàn bộ Dự án).
 */
export async function analyzeFanpagePersona(input: {
  projectId?: string | null;
  pageIds?: string[];
}): Promise<FanpagePersonaAnalysis> {
  const db = getDb();
  let targetPageIds = (input.pageIds ?? []).map((p) => p.trim()).filter(Boolean);

  if (targetPageIds.length === 0 && input.projectId) {
    const projPages = await db
      .select({ facebookPageId: facebookPages.facebookPageId })
      .from(facebookPages)
      .where(and(eq(facebookPages.projectId, input.projectId), eq(facebookPages.active, true)));
    targetPageIds = projPages.map((p) => p.facebookPageId);
  }

  const pageRows =
    targetPageIds.length > 0
      ? await db
          .select({
            facebookPageId: facebookPages.facebookPageId,
            name: facebookPages.name,
          })
          .from(facebookPages)
          .where(inArray(facebookPages.facebookPageId, targetPageIds))
      : [];
  const pageNames = pageRows.map((p) => p.name).filter((n): n is string => Boolean(n));

  const insightRows = await db
    .select({
      campaignId: metaAdInsights.campaignId,
      campaignName: metaAdInsights.campaignName,
    })
    .from(metaAdInsights)
    .where(
      targetPageIds.length > 0
        ? and(eq(metaAdInsights.level, "ad"), inArray(metaAdInsights.pageId, targetPageIds))
        : eq(metaAdInsights.level, "ad"),
    )
    .orderBy(desc(metaAdInsights.dateStart))
    .limit(400);

  const campaignIds = [
    ...new Set(insightRows.map((r) => r.campaignId).filter((c): c is string => Boolean(c))),
  ];

  const campaignNames = insightRows
    .map((r) => r.campaignName)
    .filter((n): n is string => Boolean(n));

  return fetchMetaDemographicPersona({
    campaignIds,
    fallbackNames: [...pageNames, ...campaignNames],
  });
}
