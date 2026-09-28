import { describe, expect, it } from "vitest";

import type { InsightRow } from "@/lib/db/insights-repo";

import {
  attachEfficiency,
  campaignBrand,
  dashboardTotals,
  efficiencyOf,
  filterInsightRows,
  pageLabelFromCampaigns,
  seriesByDate,
  summarizeCampaigns,
  summarizeCampaignsFromAds,
  summarizePages,
} from "./insights-view";

function row(overrides: Partial<InsightRow> & Pick<InsightRow, "objectId" | "date">): InsightRow {
  return {
    objectName: "T8.2026-Hòa Bình-Kia-Tin nhắn",
    spend: 100,
    impressions: 1000,
    clicks: 10,
    leads: 2,
    costPerLead: 50,
    ...overrides,
  };
}

describe("marketing insight view", () => {
  const rows = [
    row({ objectId: "kia", date: "2026-09-01", objectName: "T8.2026-Hòa Bình-Kia-Tin nhắn" }),
    row({
      objectId: "mazda",
      date: "2026-09-02",
      objectName: "T8.2026-Bắc Giang-Mazda-Lead",
      spend: 40,
      leads: null,
      clicks: 4,
    }),
    row({
      objectId: "peu",
      date: "2026-08-20",
      objectName: "T9.2026-Hà Nam-Peu-Lead",
      spend: 10,
      leads: 1,
    }),
  ];

  it("detects brand from the campaign name", () => {
    expect(campaignBrand("T8.2026-Bắc Giang-Kia-Tin nhắn")).toBe("KIA");
    expect(campaignBrand("T8.2026-Bắc Giang-Mazda-Lead")).toBe("MAZDA");
    expect(campaignBrand("T9.2026-Hà Nam-Peu-Lead")).toBe("PEUGEOT");
    expect(campaignBrand("T4.2026-Nghệ An-BMW-Lead")).toBe("BMW");
    expect(campaignBrand("Chiến dịch chung")).toBe("OTHER");
  });

  it("filters by date, brand, campaign and accent-insensitive search", () => {
    expect(
      filterInsightRows(rows, {
        from: "2026-09-01",
        to: "2026-09-30",
        campaignIds: [],
        brands: [],
        query: "",
      }).map((item) => item.objectId),
    ).toEqual(["kia", "mazda"]);

    expect(
      filterInsightRows(rows, {
        from: null,
        to: null,
        campaignIds: [],
        brands: ["KIA"],
        query: "hoa binh",
      }).map((item) => item.objectId),
    ).toEqual(["kia"]);

    expect(
      filterInsightRows(rows, {
        from: null,
        to: null,
        campaignIds: ["peu"],
        brands: [],
        query: "",
      }),
    ).toHaveLength(1);
  });

  it("rolls daily rows into campaign totals and treats missing leads as zero", () => {
    const [mazda] = summarizeCampaigns(rows.filter((item) => item.objectId === "mazda"));
    expect(mazda).toMatchObject({
      leads: 0,
      spend: 40,
      cpl: null,
      ctr: 0.4,
      brand: "MAZDA",
    });
  });

  it("builds a date series and dashboard rates from the visible rows", () => {
    expect(seriesByDate(rows).map((point) => point.date)).toEqual([
      "2026-08-20",
      "2026-09-01",
      "2026-09-02",
    ]);
    expect(dashboardTotals(rows.slice(0, 1))).toMatchObject({
      spend: 100,
      leads: 2,
      cpl: 50,
      ctr: 1,
    });
    expect(dashboardTotals([])).toMatchObject({ spend: null, leads: null, cpl: null });
  });

  it("rolls ads up by fanpage and rates CPL against the median", () => {
    const ads = [
      {
        ...row({ objectId: "ad-1", date: "2026-09-01", spend: 100, leads: 2 }),
        campaignId: "kia",
        campaignName: "T8.2026-Hòa Bình-Kia-Tin nhắn",
        adsetId: "set-1",
        adsetName: "Set",
        pageId: "page-a",
      },
      {
        ...row({ objectId: "ad-2", date: "2026-09-01", spend: 300, leads: 1, clicks: 5 }),
        campaignId: "mazda",
        campaignName: "T8.2026-Bắc Giang-Mazda-Lead",
        adsetId: "set-2",
        adsetName: "Set",
        pageId: "page-b",
      },
    ];

    expect(summarizePages(ads).map((page) => page.pageId)).toEqual(["page-a", "page-b"]);
    expect(summarizeCampaignsFromAds(ads.filter((item) => item.pageId === "page-a"))).toMatchObject([
      { objectId: "kia", leads: 2, cpl: 50 },
    ]);

    const rated = attachEfficiency([
      { spend: 100, leads: 2, cpl: 50 },
      { spend: 300, leads: 1, cpl: 300 },
      { spend: 40, leads: 0, cpl: null },
    ]);
    expect(rated.benchmark).toBe(175);
    expect(rated.items.map((item) => item.efficiency)).toEqual(["strong", "weak", "no_lead"]);
    expect(efficiencyOf(10, 1, 175, 175)).toBe("strong");
    expect(
      pageLabelFromCampaigns([
        "T8.2026-Bắc Giang-Kia-Tin nhắn",
        "T9.2026-Bắc Giang-Kia-Post CSBH-2tr",
      ]),
    ).toBe("Bắc Giang-Kia");
  });
});
