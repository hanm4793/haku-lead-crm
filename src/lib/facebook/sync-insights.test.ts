import { beforeEach, describe, expect, it, vi } from "vitest";

import { metaAdInsights, metaSyncRuns } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getFacebookConfig: vi.fn(),
  graphGetAllData: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("./env", () => ({ getFacebookConfig: mocks.getFacebookConfig }));
vi.mock("./graph-client", () => ({ graphGetAllData: mocks.graphGetAllData }));

import { syncFacebookInsights } from "./sync-insights";

function createDb(existingObjectIds: string[] = []) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const existing = [...existingObjectIds];

  const db = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        inserted.push({ table, values });
        if (table === metaSyncRuns) {
          return { returning: vi.fn(async () => [{ id: "run-1" }]) };
        }
        const existingObjectId = existing.shift();
        return {
          onConflictDoUpdate: vi.fn(() => ({
            returning: vi.fn(async () => [{ inserted: !existingObjectId }]),
          })),
        };
      }),
    })),
    update: vi.fn((table: unknown) => ({
      set: vi.fn((values: Record<string, unknown>) => {
        updated.push({ table, values });
        return { where: vi.fn(async () => undefined) };
      }),
    })),
  };

  return { db, inserted, updated };
}

describe("syncFacebookInsights", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useRealTimers();
    mocks.getFacebookConfig.mockReturnValue({
      token: "test-token",
      pageId: "page-1",
      pageIds: ["page-1"],
      adAccountId: "act_123",
      graphVersion: "v21.0",
    });
  });

  it("uses the last 30 UTC dates and preserves missing metrics as null", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-23T16:00:00.000Z"));
    const { db, inserted, updated } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValue([
      {
        campaign_id: "campaign-1",
        campaign_name: "Campaign one",
        date_start: "2026-09-23",
        date_stop: "2026-09-23",
        spend: "31.5",
        impressions: "1200",
        clicks: "45",
        reach: "900",
        actions: [{ action_type: "lead", value: "3" }],
        cpc: "0.7",
        cpm: "26.25",
        ctr: "3.75",
        cost_per_action_type: [{ action_type: "lead", value: "10.5" }],
      },
      {
        campaign_id: "campaign-2",
        campaign_name: "Campaign two",
        date_start: "2026-09-22",
        date_stop: "2026-09-22",
      },
    ]);

    const result = await syncFacebookInsights();

    expect(mocks.graphGetAllData).toHaveBeenCalledWith("/act_123/insights", {
      level: "campaign",
      time_increment: "1",
      time_range: JSON.stringify({ since: "2026-08-25", until: "2026-09-23" }),
      fields:
        "campaign_id,campaign_name,spend,impressions,clicks,reach,actions,cpc,cpm,ctr,cost_per_action_type",
    });
    expect(result).toMatchObject({
      imported: 2,
      updated: 0,
      skipped: 0,
      errors: 0,
      since: "2026-08-25",
      until: "2026-09-23",
    });
    expect(inserted).toContainEqual({
      table: metaAdInsights,
      values: expect.objectContaining({
        level: "campaign",
        objectId: "campaign-1",
        spend: 31.5,
        impressions: 1200,
        clicks: 45,
        leads: 3,
        costPerLead: 10.5,
      }),
    });
    expect(inserted).toContainEqual({
      table: metaAdInsights,
      values: expect.objectContaining({
        objectId: "campaign-2",
        spend: null,
        impressions: null,
        clicks: null,
        reach: null,
        leads: null,
        cpc: null,
        cpm: null,
        ctr: null,
        costPerLead: null,
      }),
    });
    expect(updated).toContainEqual({
      table: metaSyncRuns,
      values: expect.objectContaining({ status: "ok", imported: 2, errors: 0 }),
    });
  });

  it("counts an existing campaign date as updated", async () => {
    const { db } = createDb(["insight-1"]);
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValue([
      {
        campaign_id: "campaign-1",
        date_start: "2026-09-01",
        actions: [{ action_type: "onsite_conversion.messaging_lead", value: "2" }],
      },
    ]);

    await expect(
      syncFacebookInsights({ since: "2026-09-01", until: "2026-09-01" }),
    ).resolves.toMatchObject({ imported: 0, updated: 1 });
  });

  it("upserts each insight without selecting it first", async () => {
    const onConflictDoUpdate = vi.fn(() => ({
      returning: vi.fn(async () => [{ inserted: true }]),
    }));
    const db = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn(() =>
          table === metaSyncRuns
            ? { returning: vi.fn(async () => [{ id: "run-1" }]) }
            : { onConflictDoUpdate },
        ),
      })),
      select: vi.fn(() => {
        throw new Error("N+1 select must not run");
      }),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
    };
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValue([
      { campaign_id: "campaign-1", date_start: "2026-09-01" },
    ]);

    await expect(
      syncFacebookInsights({ since: "2026-09-01", until: "2026-09-01" }),
    ).resolves.toMatchObject({ imported: 1, updated: 0, errors: 0 });
    expect(db.select).not.toHaveBeenCalled();
  });

  it("uses one prioritized lead action and its matching cost without summing aliases", async () => {
    const { db, inserted } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValue([
      {
        campaign_id: "campaign-1",
        date_start: "2026-09-01",
        actions: [
          { action_type: "onsite_conversion.messaging_lead", value: "2" },
          { action_type: "onsite_conversion.lead_grouped", value: "3" },
          { action_type: "lead", value: "3" },
          { action_type: "purchase", value: "99" },
        ],
        cost_per_action_type: [
          { action_type: "onsite_conversion.messaging_lead", value: "15" },
          { action_type: "onsite_conversion.lead_grouped", value: "10" },
          { action_type: "lead", value: "10" },
        ],
      },
    ]);

    await syncFacebookInsights({ since: "2026-09-01", until: "2026-09-01" });

    expect(inserted).toContainEqual({
      table: metaAdInsights,
      values: expect.objectContaining({ leads: 3, costPerLead: 10 }),
    });
  });

  it("matches cost per lead to the selected lower-priority action type", async () => {
    const { db, inserted } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValue([
      {
        campaign_id: "campaign-1",
        date_start: "2026-09-01",
        actions: [{ action_type: "onsite_conversion.lead_grouped", value: "2.4" }],
        cost_per_action_type: [
          { action_type: "lead", value: "99" },
          { action_type: "onsite_conversion.lead_grouped", value: "12.5" },
        ],
      },
    ]);

    await syncFacebookInsights({ since: "2026-09-01", until: "2026-09-01" });

    expect(inserted).toContainEqual({
      table: metaAdInsights,
      values: expect.objectContaining({ leads: 2, costPerLead: 12.5 }),
    });
  });

  it("requires an ad account before creating a sync run", async () => {
    mocks.getFacebookConfig.mockReturnValue({
      token: "test-token",
      pageId: "page-1",
      pageIds: ["page-1"],
      adAccountId: null,
      graphVersion: "v21.0",
    });

    await expect(syncFacebookInsights()).rejects.toThrow("Thiếu FACEBOOK_AD_ACCOUNT_ID");
    expect(mocks.getDb).not.toHaveBeenCalled();
    expect(mocks.graphGetAllData).not.toHaveBeenCalled();
  });
});
