import { describe, expect, it } from "vitest";

import type { ViewerScope } from "@/lib/db/leads-repo";

import {
  applyMentions,
  formatMarketingReply,
  formatStatsReply,
  matchPages,
  mergeStats,
  pagesInScope,
  parseStatsQuestion,
  pickNamedItem,
  type StatsQuery,
} from "./stats-query";

const now = new Date(2026, 8, 26, 15, 0, 0);

const partner: ViewerScope = {
  role: "PARTNER_ADMIN",
  pageIds: ["105589125657497"],
  appUserId: "partner-1",
};

const emptyQuery: StatsQuery = {
  dateFrom: "2026-09-01",
  dateTo: "2026-09-26",
  comparePrevious: false,
  dataset: "leads",
  groupBy: null,
  rankBy: null,
  topN: null,
  pageQuery: null,
  campaignQuery: null,
  assigneeQuery: null,
  pageIds: null,
  campaignIds: null,
  adIds: null,
  leadIds: null,
  filters: {},
};

describe("parseStatsQuestion", () => {
  it("reads this month and a previous-period comparison", () => {
    const query = parseStatsQuestion("Tháng này có bao nhiêu lead? So với kỳ trước.", now);
    expect(query).toMatchObject({
      dateFrom: "2026-09-01",
      dateTo: "2026-09-26",
      comparePrevious: true,
      dataset: "both",
      groupBy: null,
    });
  });

  it("reads ad spend without mixing in CRM status", () => {
    const query = parseStatsQuestion("Chi tiêu và CPL theo fanpage tháng này", now);
    expect(query?.dataset).toBe("marketing");
    expect(query?.groupBy).toBe("fanpage");
    expect(parseStatsQuestion("Chi tiêu tháng này", now)?.dataset).toBe("marketing");
  });

  it("keeps contact-rate questions on CRM leads", () => {
    expect(parseStatsQuestion("Tỷ lệ đã liên hệ tháng này", now)?.dataset).toBe("leads");
  });

  it("ranks individual ads by lead count, not campaigns by spend", () => {
    const query = parseStatsQuestion("Quảng cáo nào thu về nhiều lead nhất", now);
    expect(query).toMatchObject({ dataset: "marketing", groupBy: "ad", rankBy: "leads", topN: 5 });
  });

  it("lets the question override a model that grouped by campaign", () => {
    const local = parseStatsQuestion("Quảng cáo nào thu về nhiều lead nhất", now);
    const model: StatsQuery = {
      ...emptyQuery,
      dataset: "marketing",
      groupBy: "campaign",
      rankBy: null,
      dateFrom: null,
      dateTo: null,
    };
    expect(mergeStats(model, local)).toMatchObject({ groupBy: "ad", rankBy: "leads", dataset: "marketing" });
  });

  it("filters a named campaign instead of ranking campaigns", () => {
    const query = parseStatsQuestion(
      "Quảng cáo thu về nhiều lead nhất của chiến dịch T8.2026-Bắc Giang-Kia-Tin nhắn",
      now,
    );
    expect(query).toMatchObject({
      dataset: "marketing",
      groupBy: "ad",
      rankBy: "leads",
      campaignQuery: "t8.2026-bac giang-kia-tin nhan",
    });
  });

  it("ranks campaigns by lowest CPL when no campaign is named", () => {
    const query = parseStatsQuestion("Chiến dịch nào có CPL thấp nhất", now);
    expect(query).toMatchObject({ groupBy: "campaign", rankBy: "cpl", campaignQuery: null });
  });

  it("keeps an exact campaign name when a longer copy also matches", () => {
    const picked = pickNamedItem(
      [
        { id: "1", name: "T8.2026-Bắc Giang-Kia-Tin nhắn" },
        { id: "2", name: "T8.2026-Bắc Giang-Kia-Tin nhắn - Bản sao" },
      ],
      "t8.2026-bac giang-kia-tin nhan",
    );
    expect(picked).toEqual({ status: "one", item: { id: "1", name: "T8.2026-Bắc Giang-Kia-Tin nhắn" } });
  });

  it("does not guess when several campaigns contain the same fragment", () => {
    const picked = pickNamedItem(
      [
        { id: "1", name: "T8 Kia Tin nhắn" },
        { id: "2", name: "T6 Kia Tin nhắn" },
      ],
      "kia tin nhan",
    );
    expect(picked.status).toBe("many");
  });

  it("turns an @ campaign into an id filter", () => {
    const query = applyMentions(emptyQuery, [{ type: "campaign", id: "cmp-1", label: "T8 Kia" }]);
    expect(query.campaignIds).toEqual(["cmp-1"]);
    expect(query.campaignQuery).toBeNull();
  });

  it("groups by fanpage without treating the word fanpage as a page name", () => {
    const query = parseStatsQuestion("Lead theo từng fanpage tháng này", now);
    expect(query?.groupBy).toBe("fanpage");
    expect(query?.pageQuery).toBeNull();
    expect(query?.dateFrom).toBe("2026-09-01");
  });

  it("leaves export requests to the export parser", () => {
    expect(parseStatsQuestion("Xuất lead tháng này ra excel", now)).toBeNull();
  });
});

describe("pagesInScope", () => {
  const pages = [
    { facebookPageId: "105589125657497", name: "Peugeot Hà Nam" },
    { facebookPageId: "101485941821461", name: "Kia Hòa Bình" },
  ];

  it("hides pages the partner is not granted", () => {
    expect(pagesInScope(pages, partner).map((page) => page.name)).toEqual(["Peugeot Hà Nam"]);
  });

  it("matches a name only inside the pages passed in", () => {
    const visible = pagesInScope(pages, partner);
    expect(matchPages(visible, "kia")).toEqual([]);
    expect(matchPages(visible, "peugeot").map((page) => page.facebookPageId)).toEqual(["105589125657497"]);
  });
});

describe("formatStatsReply", () => {
  it("tells a partner with no pages that there is nothing to see", () => {
    const reply = formatStatsReply({
      viewer: { role: "PARTNER_ADMIN", pageIds: [] },
      query: emptyQuery,
      kpis: {
        total: 99,
        contacted: 1,
        contactRate: 1,
        khqt: 1,
        khqtRate: 1,
        gdtd: 0,
        khd: 0,
        failed: 0,
        failRate: 0,
        overdue: 0,
      },
      previous: null,
      previousRange: null,
      breakdown: null,
    });
    expect(reply).toContain("chưa được gán fanpage");
    expect(reply).not.toContain("99");
  });

  it("prints database figures and the previous window", () => {
    const reply = formatStatsReply({
      viewer: { role: "SUPER_ADMIN", pageIds: [] },
      query: { ...emptyQuery, comparePrevious: true, groupBy: "fanpage" },
      kpis: {
        total: 26,
        contacted: 10,
        contactRate: 38.4615,
        khqt: 4,
        khqtRate: 40,
        gdtd: 1,
        khd: 0,
        failed: 3,
        failRate: 11.538,
        overdue: 2,
      },
      previous: {
        total: 20,
        contacted: 8,
        contactRate: 40,
        khqt: 3,
        khqtRate: 37.5,
        gdtd: 1,
        khd: 0,
        failed: 2,
        failRate: 10,
        overdue: 1,
      },
      previousRange: { from: "2026-08-06", to: "2026-08-31" },
      breakdown: [{ key: "Peugeot Hà Nam", leads: 26, contacted: 10, khqt: 4, failed: 3 }],
    });
    expect(reply).toContain("Tổng lead: 26");
    expect(reply).toContain("tăng 6");
    expect(reply).toContain("06/08/2026–31/08/2026");
    expect(reply).toContain("Peugeot Hà Nam: 26 lead");
  });
});

describe("formatMarketingReply", () => {
  it("labels ad leads separately from CRM rows", () => {
    const reply = formatMarketingReply({
      viewer: { role: "SUPER_ADMIN", pageIds: [] },
      query: { ...emptyQuery, dataset: "marketing", groupBy: "ad", rankBy: "leads", topN: 5 },
      totals: { spend: 1_500_000, impressions: 1000, clicks: 40, leads: 10 },
      previous: null,
      previousRange: null,
      breakdown: [
        { key: "Mẫu A — Chiến dịch X", spend: 800_000, impressions: 400, clicks: 20, leads: 12 },
        { key: "Mẫu B", spend: 1_500_000, impressions: 600, clicks: 20, leads: 4 },
      ],
    });
    expect(reply.startsWith("Quảng cáo — lượt trên Ads")).toBe(true);
    expect(reply).toContain("Quảng cáo thu nhiều lead nhất: Mẫu A — Chiến dịch X.");
    expect(reply).toContain("12 lượt lead quảng cáo");
    expect(reply).not.toContain("KHQT");
  });
});
