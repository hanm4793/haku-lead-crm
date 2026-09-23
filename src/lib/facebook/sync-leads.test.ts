import { beforeEach, describe, expect, it, vi } from "vitest";

import { activityLogs, leads, metaSyncRuns } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getFacebookConfig: vi.fn(),
  graphGetAllData: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("./env", () => ({ getFacebookConfig: mocks.getFacebookConfig }));
vi.mock("./graph-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./graph-client")>();
  return { ...original, graphGetAllData: mocks.graphGetAllData };
});

import { syncFacebookLeads } from "./sync-leads";

function createDb(existingLeadIds: string[] = []) {
  const inserted: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const existing = [...existingLeadIds];

  const db = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        inserted.push({ table, values });
        return {
          returning: vi.fn(async () =>
            table === metaSyncRuns ? [{ id: "run-1" }] : [{ id: "lead-new" }],
          ),
        };
      }),
    })),
    select: vi.fn(() => ({
      from: vi.fn(() => ({
        where: vi.fn(() => ({
          limit: vi.fn(async () => {
            const id = existing.shift();
            return id ? [{ id }] : [];
          }),
        })),
      })),
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

describe("syncFacebookLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFacebookConfig.mockReturnValue({
      token: "test-token",
      pageId: "page-1",
      adAccountId: null,
      graphVersion: "v21.0",
    });
  });

  it("imports valid leads, skips missing phones, and records the run", async () => {
    const { db, inserted, updated } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-1", name: "Test form" }])
      .mockResolvedValueOnce([
        {
          id: "fb-1",
          created_time: "2026-09-22T08:00:00+0000",
          field_data: [
            { name: "full_name", values: ["Nguyen A"] },
            { name: "phone_number", values: ["0901234567"] },
          ],
          ad_id: "ad-1",
          ad_name: "Ad one",
          adset_id: "adset-1",
          campaign_id: "campaign-1",
          campaign_name: "Campaign one",
        },
        {
          id: "fb-2",
          created_time: "2026-09-22T09:00:00+0000",
          field_data: [{ name: "full_name", values: ["No phone"] }],
        },
      ]);

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({
      imported: 1,
      updated: 0,
      skipped: 1,
      errors: 0,
      runId: "run-1",
    });
    expect(inserted).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        facebookLeadId: "fb-1",
        phone: "0901234567",
        source: "FACEBOOK",
        channelDetail: "FORM",
        showroomId: null,
        salesRoomId: null,
        brand: null,
        assigneeId: null,
        costPerLead: null,
      }),
    });
    expect(inserted).toContainEqual({
      table: activityLogs,
      values: expect.objectContaining({
        leadId: "lead-new",
        kind: "CREATE",
        actorName: "Facebook sync",
      }),
    });
    expect(updated).toContainEqual({
      table: metaSyncRuns,
      values: expect.objectContaining({
        status: "ok",
        imported: 1,
        skipped: 1,
        errors: 0,
      }),
    });
  });

  it("updates an existing lead without replacing ownership fields", async () => {
    const { db, inserted, updated } = createDb(["existing-1"]);
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-1" }])
      .mockResolvedValueOnce([
        {
          id: "fb-existing",
          field_data: [{ name: "phone_number", values: ["0901000000"] }],
          ad_name: "Latest ad",
          campaign_name: "Latest campaign",
        },
      ]);

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    expect(updated).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        name: null,
        campaign: "Latest campaign",
        adContent: "Latest ad",
      }),
    });
    const leadUpdate = updated.find((entry) => entry.table === leads)?.values;
    expect(leadUpdate).not.toHaveProperty("showroomId");
    expect(leadUpdate).not.toHaveProperty("salesRoomId");
    expect(leadUpdate).not.toHaveProperty("brand");
    expect(leadUpdate).not.toHaveProperty("assigneeId");
    expect(inserted.filter((entry) => entry.table === activityLogs)).toHaveLength(0);
  });
});
