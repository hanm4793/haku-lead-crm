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
import { queryMarketingSnapshot, listCampaignNames, type MarketingBreakdownRow } from "@/lib/db/insights-repo";
import { queryPivot, queryReportKpis } from "@/lib/db/report-queries";
import { appUsers, brands, facebookPages, leads, locations, products } from "@/lib/db/schema";
import type { PivotDimension } from "@/lib/metrics";

import type { AiCatalog } from "./catalog-context";
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
  type ChatMention,
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

  return rows.map((r) => {
    const contactRate = r.leads > 0 ? r.contacted / r.leads : 0;
    const khqtRate = r.contacted > 0 ? r.khqt / r.contacted : (r.leads > 0 ? r.khqt / r.leads : 0);
    const failRate = r.leads > 0 ? r.failed / r.leads : 0;
    return { ...r, contactRate, khqtRate, failRate };
  });
}

export interface ChatSuggestion {
  label: string;
  prompt: string;
  mentions: ChatMention[];
}

export interface AnswerStatsOutput {
  reply: string;
  leadBreakdown?: StatsBreakdownRow[] | null;
  marketingRows?: MarketingBreakdownRow[] | null;
  suggestions: ChatSuggestion[];
}

function generateSuggestions(query: StatsQuery, mentions: ChatMention[] = []): ChatSuggestion[] {
  const suggestions: ChatSuggestion[] = [];
  const primaryMention = mentions[0];

  if (primaryMention) {
    const name = primaryMention.label;
    if (primaryMention.type === "campaign") {
      suggestions.push(
        {
          label: `Quảng cáo nhiều lead nhất của ${name}`,
          prompt: `Quảng cáo nào nhiều lead nhất của`,
          mentions: [primaryMention],
        },
        {
          label: `So sánh ${name} với kỳ trước`,
          prompt: `So sánh với kỳ trước`,
          mentions: [primaryMention],
        },
        {
          label: `Đối chiếu lead CRM và lead ads của ${name}`,
          prompt: `Đối chiếu lead CRM và lead quảng cáo của`,
          mentions: [primaryMention],
        },
      );
    } else if (primaryMention.type === "fanpage") {
      suggestions.push(
        {
          label: `Xem chi tiết theo nhân viên của ${name}`,
          prompt: `Xem chi tiết theo nhân viên của`,
          mentions: [primaryMention],
        },
        {
          label: `So sánh ${name} với kỳ trước`,
          prompt: `So sánh với kỳ trước của`,
          mentions: [primaryMention],
        },
        {
          label: `Xuất danh sách lead của ${name} ra Excel`,
          prompt: `Xuất danh sách lead của`,
          mentions: [primaryMention],
        },
      );
    } else if (primaryMention.type === "assignee") {
      suggestions.push(
        {
          label: `Phân loại trạng thái lead của ${name}`,
          prompt: `Xem chi tiết theo phân loại của`,
          mentions: [primaryMention],
        },
        {
          label: `So sánh ${name} với kỳ trước`,
          prompt: `So sánh với kỳ trước của`,
          mentions: [primaryMention],
        },
        {
          label: `Xuất danh sách lead của ${name} ra Excel`,
          prompt: `Xuất danh sách lead của`,
          mentions: [primaryMention],
        },
      );
    } else if (primaryMention.type === "product" || primaryMention.type === "brand") {
      suggestions.push(
        {
          label: `Xem chi tiết theo nguồn của ${name}`,
          prompt: `Xem chi tiết theo nguồn của`,
          mentions: [primaryMention],
        },
        {
          label: `Xem chi tiết theo nhân viên phụ trách ${name}`,
          prompt: `Xem chi tiết theo nhân viên của`,
          mentions: [primaryMention],
        },
        {
          label: `Xuất danh sách lead ${name} ra Excel`,
          prompt: `Xuất danh sách lead của`,
          mentions: [primaryMention],
        },
      );
    } else {
      suggestions.push(
        {
          label: `Chi tiết theo nhân viên của ${name}`,
          prompt: `Chi tiết theo nhân viên của`,
          mentions: [primaryMention],
        },
        {
          label: `So sánh ${name} với kỳ trước`,
          prompt: `So sánh với kỳ trước`,
          mentions: [primaryMention],
        },
      );
    }
    return suggestions.slice(0, 3);
  }

  if (query.dataset === "marketing") {
    suggestions.push(
      { label: "Quảng cáo nào CPL rẻ nhất?", prompt: "Quảng cáo nào có CPL thấp nhất?", mentions: [] },
      { label: "Chi tiêu theo từng chiến dịch", prompt: "Chi tiêu theo từng chiến dịch tháng này", mentions: [] },
      { label: "Đối chiếu lead CRM và lead quảng cáo", prompt: "Đối chiếu lead CRM và lead quảng cáo", mentions: [] },
    );
  } else if (query.dataset === "both") {
    suggestions.push(
      { label: "Quảng cáo nào mang lại nhiều lead nhất?", prompt: "Quảng cáo nào mang lại nhiều lead nhất?", mentions: [] },
      { label: "Xem chi tiết lead theo nhân viên", prompt: "Xem chi tiết lead theo nhân viên tháng này", mentions: [] },
      { label: "Xuất file Excel tháng này", prompt: "Xuất lead tháng này ra excel", mentions: [] },
    );
  } else {
    if (!query.groupBy) {
      suggestions.push(
        { label: "Xem chi tiết theo nhân viên", prompt: "Xem chi tiết lead theo nhân viên", mentions: [] },
        { label: "Chi tiết theo fanpage", prompt: "Xem chi tiết theo fanpage", mentions: [] },
        { label: "So sánh với kỳ trước", prompt: "So sánh với kỳ trước", mentions: [] },
      );
    } else {
      suggestions.push(
        { label: "Xuất danh sách này ra Excel", prompt: "Xuất danh sách này ra excel", mentions: [] },
        { label: "So sánh với kỳ trước", prompt: "So sánh với kỳ trước", mentions: [] },
        { label: "Xem chi tiêu quảng cáo tương ứng", prompt: "Chi tiêu quảng cáo tương ứng", mentions: [] },
      );
    }
  }
  return suggestions.slice(0, 3);
}

/**
 * Chạy đúng hàm thống kê CRM đã có, trong phạm vi fanpage của người đang đăng nhập.
 * Câu trả lời do code ghép từ kết quả SQL, không lấy số từ model.
 */
export async function answerFromStats(
  query: StatsQuery,
  viewer: ViewerScope,
  now: Date,
  question = "",
  catalog?: AiCatalog,
  mentions: ChatMention[] = [],
): Promise<AnswerStatsOutput> {
  const suggestions = generateSuggestions(query, mentions);
  const dataset = query.dataset ?? "leads";
  if (viewer.role !== "SUPER_ADMIN" && viewer.pageIds.length === 0) {
    if (dataset === "marketing") {
      return {
        reply: "Tài khoản chưa được gán fanpage, nên không có số quảng cáo trong phạm vi xem.",
        suggestions,
      };
    }
    if (dataset === "both") {
      return {
        reply: "Tài khoản chưa được gán fanpage, nên không có lead CRM và không có số quảng cáo trong phạm vi xem.",
        suggestions,
      };
    }
    return {
      reply: formatStatsReply({
        viewer,
        query,
        kpis: emptyKpis(),
        previous: null,
        previousRange: null,
        breakdown: null,
      }),
      suggestions,
    };
  }

  const visible = pagesInScope(
    await listFacebookPages(viewer.activeProjectId ? { projectId: viewer.activeProjectId } : undefined),
    viewer,
  );
  let pageIds = query.pageIds ?? [];
  if (!pageIds.length && query.pageQuery) {
    const matched = matchPages(visible, query.pageQuery);
    if (matched.length === 0) {
      return {
        reply: formatStatsReply({
          viewer,
          query,
          kpis: emptyKpis(),
          previous: null,
          previousRange: null,
          breakdown: null,
          unmatchedPage: query.pageQuery,
          visiblePageNames: visible.map((page) => page.name ?? page.facebookPageId),
        }),
        suggestions,
      };
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
  if (leadOnly) return { reply: sections.join("\n\n"), suggestions };

  let leadBreakdown: StatsBreakdownRow[] | null = null;
  let marketingRows: MarketingBreakdownRow[] | null = null;

  if (dataset !== "marketing") {
    const leadRes = await leadSection(query, viewer, now, pageIds, dataset === "leads" && mentionsAdsMetrics(question));
    sections.push(leadRes.reply);
    leadBreakdown = leadRes.breakdown;
  }
  if (dataset !== "leads") {
    const mktRes = await marketingSection(query, viewer, pageIds, catalog);
    sections.push(mktRes.reply);
    marketingRows = mktRes.rows;
  }
  return {
    reply: sections.join("\n\n"),
    leadBreakdown,
    marketingRows,
    suggestions,
  };
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
    breakdown = pivot.rows.slice(0, 12).map((row) => {
      const contactRate = row.leads > 0 ? row.contacted / row.leads : 0;
      const khqtRate = row.contacted > 0 ? row.khqt / row.contacted : (row.leads > 0 ? row.khqt / row.leads : 0);
      const failRate = row.leads > 0 ? row.failed / row.leads : 0;
      return {
        key: row.key,
        leads: row.leads,
        contacted: row.contacted,
        contactRate,
        khqt: row.khqt,
        khqtRate,
        failed: row.failed,
        failRate,
      };
    });
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
  return {
    reply: query.dataset === "both" ? `Lead CRM\n${reply}` : reply,
    breakdown,
  };
}

async function marketingSection(
  query: StatsQuery,
  viewer: ViewerScope,
  pageIds: string[],
  catalog?: AiCatalog,
) {
  let scopedPages: string[] | null = null;
  if (viewer.activeProjectId) {
    const projectPages = await listFacebookPages({ projectId: viewer.activeProjectId });
    const projectPageIds = projectPages.map((p) => p.facebookPageId);
    if (viewer.role === "SUPER_ADMIN") {
      scopedPages = pageIds.length > 0 ? pageIds.filter((id) => projectPageIds.includes(id)) : projectPageIds;
    } else {
      const allowed = viewer.pageIds.filter((id) => projectPageIds.includes(id));
      scopedPages = pageIds.length > 0 ? pageIds.filter((id) => allowed.includes(id)) : allowed;
    }
    if (scopedPages.length === 0) {
      return {
        reply: "Không có fanpage nào thuộc dự án hiện tại trong phạm vi phân quyền của bạn.",
        rows: null,
      };
    }
  } else {
    scopedPages =
      viewer.role === "SUPER_ADMIN"
        ? pageIds.length > 0
          ? pageIds
          : null
        : pageIds.length > 0
          ? pageIds.filter((id) => viewer.pageIds.includes(id))
          : viewer.pageIds;
  }

  let campaignIds = query.campaignIds;
  if (!campaignIds?.length && query.campaignQuery) {
    const found = await listCampaignNames(scopedPages, query.campaignQuery);
    const picked = pickNamedItem(found, query.campaignQuery);
    if (picked.status === "none") {
      return {
        reply: `Không thấy chiến dịch khớp «${query.campaignQuery}» trong phạm vi tài khoản. Gõ @ để chọn.`,
        rows: null,
      };
    }
    if (picked.status === "many") {
      return {
        reply: formatAmbiguousName(
          "chiến dịch",
          query.campaignQuery,
          picked.items.map((item) => item.name),
        ),
        rows: null,
      };
    }
    campaignIds = [picked.item.id];
  }
  const previousRange = previousRangeFor(query);
  const groupBy = marketingGroupBy(query.groupBy);
  const brands = query.filters.brands ?? [];
  const brandOptions = catalog ? catalog.brands.map((b) => ({ code: b, name: b })) : undefined;

  const [current, previous] = await Promise.all([
    queryMarketingSnapshot({
      from: query.dateFrom,
      to: query.dateTo,
      pageIds: scopedPages,
      campaignContains: campaignIds?.length ? null : query.campaignQuery,
      campaignIds,
      adIds: query.adIds,
      brands,
      brandOptions,
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
          brandOptions,
          groupBy: null,
        })
      : Promise.resolve(null),
  ]);

  return {
    reply: formatMarketingReply({
      viewer,
      query,
      totals: current.totals,
      previous: previous?.totals ?? null,
      previousRange,
      breakdown: current.rows,
    }),
    rows: current.rows,
  };
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
