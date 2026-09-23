import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
}));

vi.mock("./client", () => ({ getDb: mocks.getDb }));

import { aggregateCampaignInsights, listCampaignInsights } from "./insights-repo";

describe("insights repository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lists campaign rows in the requested inclusive UTC date range", async () => {
    const orderBy = vi.fn(async () => [
      {
        objectId: "campaign-1",
        objectName: "Campaign one",
        dateStart: new Date("2026-09-10T00:00:00.000Z"),
        spend: 12.5,
        impressions: null,
        clicks: 3,
        leads: null,
        costPerLead: null,
      },
    ]);
    const where = vi.fn(() => ({ orderBy }));
    const from = vi.fn(() => ({ where }));
    const select = vi.fn(() => ({ from }));
    mocks.getDb.mockReturnValue({ select });

    await expect(
      listCampaignInsights({ from: "2026-09-01", to: "2026-09-30" }),
    ).resolves.toEqual([
      {
        objectId: "campaign-1",
        objectName: "Campaign one",
        date: "2026-09-10",
        spend: 12.5,
        impressions: null,
        clicks: 3,
        leads: null,
        costPerLead: null,
      },
    ]);
    expect(where).toHaveBeenCalledOnce();
    expect(orderBy).toHaveBeenCalledOnce();
  });

  it("sums known KPI values but keeps an entirely missing metric null", () => {
    const totals = aggregateCampaignInsights([
      {
        objectId: "campaign-1",
        objectName: "One",
        date: "2026-09-10",
        spend: 12.5,
        impressions: null,
        clicks: 3,
        leads: null,
        costPerLead: null,
      },
      {
        objectId: "campaign-2",
        objectName: "Two",
        date: "2026-09-11",
        spend: null,
        impressions: null,
        clicks: 2,
        leads: 1,
        costPerLead: null,
      },
    ]);

    expect(totals).toEqual({
      spend: 12.5,
      impressions: null,
      clicks: 5,
      leads: 1,
    });
  });
});
