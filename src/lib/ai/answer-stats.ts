import { and, desc, eq, inArray, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import {
  criteriaConditions,
  criteriaFromLeadFilters,
  scopeConditions,
  type LeadCriteria,
  type ViewerScope,
} from "@/lib/db/leads-repo";
import { queryMarketingSnapshot, listCampaignNames } from "@/lib/db/insights-repo";
import { queryPivot, queryReportKpis } from "@/lib/db/report-queries";
import { appUsers, brands, facebookPages, leads, locations, products } from "@/lib/db/schema";
import type { PivotDimension } from "@/lib/metrics";

import {
  formatAmbiguousName,
  formatMarketingReply,
  formatStatsReply,
  marketingGroupBy,
  mentionsAdsMetrics,
  pagesInScope,
  matchPages,
  pickNamedItem,
  previousRangeFor,
  type StatsBreakdownRow,
  type StatsQuery,
  statsToFilters,
} from "./stats-query";

async function queryByFanpage(
  filters: ReturnType<typeof statsToFilters>,
  viewer: ViewerScope,
  now: Date,
  extra: Partial<LeadCriteria>,
): Promise<StatsBreakdownRow[]> {
  const criteria: LeadCriteria = { ...criteriaFromLeadFilters(filters), ...extra };
  const parts = criteriaConditions(criteria, viewer, now);
  const rows = await getDb()
    .select({
      key: sql<string>`coalesce(${facebookPages.name}, ${leads.facebookPageId}, 'Không gắn fanpage')`,
      leads: sql<number>`count(*)::int`,
      contacted: sql<number>`count(*) filter (where ${leads.contactStatus} = 'DA_LIEN_HE')::int`,
      khqt: sql<number>`count(*) filter (where ${leads.category} in ('KHQT', 'GDTD', 'KHD'))::int`,
      failed: sql<number>`count(*) filter (where ${leads.category} = 'FAIL')::int`,
    })
    .from(leads)
    .leftJoin(facebookPages, eq(leads.facebookPageId, facebookPages.facebookPageId))
    .leftJoin(brands, eq(leads.brandId, brands.id))
    .leftJoin(locations, eq(leads.locationId, locations.id))
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .leftJoin(products, eq(leads.productId, products.id))
    .where(parts.length ? and(...parts) : undefined)
    .groupBy(sql`1`)
    .orderBy(desc(sql`count(*)`))
    .limit(12);

  return rows;
}

/**
 * Chạy đúng hàm thống kê CRM đã có, trong phạm vi fanpage của người đang đăng nhập.
 * Câu trả lời do code ghép từ kết quả SQL, không lấy số từ model.
 */
export async function answerFromStats(query: StatsQuery, viewer: ViewerScope, now: Date, question = "") {
  const dataset = query.dataset ?? "leads";
  if (viewer.role !== "SUPER_ADMIN" && viewer.pageIds.length === 0) {
    if (dataset === "marketing") {
      return "Tài khoản chưa được gán fanpage, nên không có số quảng cáo trong phạm vi xem.";
    }
    if (dataset === "both") {
      return "Tài khoản chưa được gán fanpage, nên không có lead CRM và không có số quảng cáo trong phạm vi xem.";
    }
    return formatStatsReply({
      viewer,
      query,
      kpis: emptyKpis(),
      previous: null,
      previousRange: null,
      breakdown: null,
    });
  }

  const visible = pagesInScope(
    await listFacebookPages(viewer.activeProjectId ? { projectId: viewer.activeProjectId } : undefined),
    viewer,
  );
  let pageIds = query.pageIds ?? [];
  if (!pageIds.length && query.pageQuery) {
    const matched = matchPages(visible, query.pageQuery);
    if (matched.length === 0) {
      return formatStatsReply({
        viewer,
        query,
        kpis: emptyKpis(),
        previous: null,
        previousRange: null,
        breakdown: null,
        unmatchedPage: query.pageQuery,
        visiblePageNames: visible.map((page) => page.name ?? page.facebookPageId),
      });
    }
    pageIds = matched.map((page) => page.facebookPageId);
  }

  const sections: string[] = [];
  if (query.leadIds?.length) {
    sections.push(await lookupTaggedLeads(query.leadIds, viewer));
  }
  const leadOnly =
    Boolean(query.leadIds?.length) &&
    !query.dateFrom &&
    !query.dateTo &&
    !query.groupBy &&
    !query.rankBy &&
    !query.campaignQuery &&
    !query.campaignIds?.length &&
    !query.adIds?.length &&
    !query.pageQuery &&
    !query.pageIds?.length;
  if (leadOnly) return sections.join("\n\n");
  if (dataset !== "marketing") {
    sections.push(await leadSection(query, viewer, now, pageIds, dataset === "leads" && mentionsAdsMetrics(question)));
  }
  if (dataset !== "leads") {
    sections.push(await marketingSection(query, viewer, pageIds));
  }
  return sections.join("\n\n");
}

async function leadSection(
  query: StatsQuery,
  viewer: ViewerScope,
  now: Date,
  pageIds: string[],
  adsNote: boolean,
) {
  const filters = statsToFilters(query, pageIds);
  const extra: Partial<LeadCriteria> = {
    campaignContains: query.campaignQuery ?? undefined,
    assigneeContains: query.assigneeQuery ?? undefined,
  };

  const kpis = await queryReportKpis(filters, viewer, now, extra);
  const previousRange = previousRangeFor(query);
  const previous =
    previousRange?.from && previousRange.to
      ? await queryReportKpis(
          { ...filters, dateFrom: previousRange.from, dateTo: previousRange.to },
          viewer,
          now,
          extra,
        )
      : null;

  let breakdown: StatsBreakdownRow[] | null = null;
  if (query.groupBy === "fanpage") {
    breakdown = await queryByFanpage(filters, viewer, now, extra);
  } else if (query.groupBy && query.groupBy !== "ad") {
    const pivot = await queryPivot(filters, viewer, now, query.groupBy as PivotDimension, null, extra);
    breakdown = pivot.rows.slice(0, 12).map((row) => ({
      key: row.key,
      leads: row.leads,
      contacted: row.contacted,
      khqt: row.khqt,
      failed: row.failed,
    }));
  }

  const reply = formatStatsReply({
    viewer,
    query,
    kpis,
    previous,
    previousRange,
    breakdown,
    adsNote,
  });
  return query.dataset === "both" ? `Lead CRM\n${reply}` : reply;
}

async function marketingSection(query: StatsQuery, viewer: ViewerScope, pageIds: string[]) {
  const scopedPages =
    viewer.role === "SUPER_ADMIN" ? (pageIds.length > 0 ? pageIds : null) : pageIds.length > 0 ? pageIds : viewer.pageIds;
  let campaignIds = query.campaignIds;
  if (!campaignIds?.length && query.campaignQuery) {
    const found = await listCampaignNames(scopedPages, query.campaignQuery);
    const picked = pickNamedItem(found, query.campaignQuery);
    if (picked.status === "none") {
      return `Không thấy chiến dịch khớp «${query.campaignQuery}» trong phạm vi tài khoản. Gõ @ để chọn.`;
    }
    if (picked.status === "many") {
      return formatAmbiguousName(
        "chiến dịch",
        query.campaignQuery,
        picked.items.map((item) => item.name),
      );
    }
    campaignIds = [picked.item.id];
  }
  const previousRange = previousRangeFor(query);
  const groupBy = marketingGroupBy(query.groupBy);
  // Insights không có brand_id — lọc theo heuristic tên chiến dịch, chỉ với brand đã biết.
  const brands = (query.filters.brands ?? []).filter(isCampaignBrand);
  const [current, previous] = await Promise.all([
    queryMarketingSnapshot({
      from: query.dateFrom,
      to: query.dateTo,
      pageIds: scopedPages,
      campaignContains: campaignIds?.length ? null : query.campaignQuery,
      campaignIds,
      adIds: query.adIds,
      brands,
      groupBy,
      rankBy: query.rankBy,
      limit: query.topN ?? undefined,
    }),
    previousRange?.from && previousRange.to
      ? queryMarketingSnapshot({
          from: previousRange.from,
          to: previousRange.to,
          pageIds: scopedPages,
          campaignContains: campaignIds?.length ? null : query.campaignQuery,
          campaignIds,
          adIds: query.adIds,
          brands,
          groupBy: null,
        })
      : Promise.resolve(null),
  ]);

  return formatMarketingReply({
    viewer,
    query,
    totals: current.totals,
    previous: previous?.totals ?? null,
    previousRange,
    breakdown: current.rows,
  });
}

type CampaignBrand = "KIA" | "MAZDA" | "PEUGEOT" | "BMW";
const CAMPAIGN_BRANDS: readonly CampaignBrand[] = ["KIA", "MAZDA", "PEUGEOT", "BMW"];

function isCampaignBrand(code: string): code is CampaignBrand {
  return (CAMPAIGN_BRANDS as readonly string[]).includes(code);
}

async function lookupTaggedLeads(ids: string[], viewer: ViewerScope) {
  const rows = await getDb()
    .select({
      name: leads.name,
      phone: leads.phone,
      category: leads.category,
      contactStatus: leads.contactStatus,
      campaign: leads.campaign,
      assignee: appUsers.fullName,
    })
    .from(leads)
    .leftJoin(appUsers, eq(leads.assigneeId, appUsers.id))
    .where(and(inArray(leads.id, ids), ...scopeConditions(viewer)))
    .limit(8);

  if (rows.length === 0) return "Không thấy lead đã chọn trong phạm vi tài khoản.";
  return rows
    .map(
      (row) =>
        `Lead ${row.name} — ${row.phone}, trạng thái ${row.category}, ${row.contactStatus === "DA_LIEN_HE" ? "đã liên hệ" : "chưa liên hệ"}, phụ trách ${row.assignee ?? "chưa giao"}${row.campaign ? `, chiến dịch ${row.campaign}` : ""}.`,
    )
    .join("\n");
}

function emptyKpis() {
  return {
    total: 0,
    contacted: 0,
    uncontacted: 0,
    contactRate: 0,
    khqt: 0,
    khqtRate: 0,
    gdtd: 0,
    khd: 0,
    failed: 0,
    failRate: 0,
    overdue: 0,
  };
}
