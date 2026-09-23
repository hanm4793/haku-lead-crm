import { beforeEach, describe, expect, it, vi } from "vitest";

import { activityLogs, leads, metaSyncRuns } from "@/lib/db/schema";
import { FacebookGraphError } from "./graph-client";

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
  const inserted: Array<{
    table: unknown;
    values: Record<string, unknown>;
    inTransaction: boolean;
  }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const existing = [...existingLeadIds];
  let transactionDepth = 0;

  const db = {
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((values: Record<string, unknown>) => {
        inserted.push({ table, values, inTransaction: transactionDepth > 0 });
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
    transaction: vi.fn(),
  };
  db.transaction.mockImplementation(
    async (callback: (tx: Omit<typeof db, "transaction">) => Promise<unknown>) => {
      transactionDepth += 1;
      try {
        return await callback(db);
      } finally {
        transactionDepth -= 1;
      }
    },
  );

  return { db, inserted, updated };
}

describe("syncFacebookLeads", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getFacebookConfig.mockReturnValue({
      token: "test-token",
      pageId: "page-1",
      pageIds: ["page-1"],
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
      inTransaction: true,
    });
    expect(inserted).toContainEqual({
      table: activityLogs,
      values: expect.objectContaining({
        leadId: "lead-new",
        kind: "CREATE",
        actorName: "Facebook sync",
      }),
      inTransaction: true,
    });
    expect(db.transaction).toHaveBeenCalledOnce();
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

  it("preserves existing CRM fields when Facebook returns null metadata", async () => {
    const { db, inserted, updated } = createDb(["existing-1"]);
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-1" }])
      .mockResolvedValueOnce([
        {
          id: "fb-existing",
          field_data: [{ name: "phone_number", values: ["0901000000"] }],
          ad_name: "Latest ad",
        },
      ]);

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({ imported: 0, updated: 1, skipped: 0, errors: 0 });
    expect(updated).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        adContent: "Latest ad",
      }),
    });
    const leadUpdate = updated.find((entry) => entry.table === leads)?.values;
    expect(leadUpdate).not.toHaveProperty("name");
    expect(leadUpdate).not.toHaveProperty("campaign");
    expect(leadUpdate).not.toHaveProperty("showroomId");
    expect(leadUpdate).not.toHaveProperty("salesRoomId");
    expect(leadUpdate).not.toHaveProperty("brand");
    expect(leadUpdate).not.toHaveProperty("assigneeId");
    expect(inserted.filter((entry) => entry.table === activityLogs)).toHaveLength(0);
  });

  it("retries with basic fields only for invalid-field Graph errors", async () => {
    const { db } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-1" }])
      .mockRejectedValueOnce(
        new FacebookGraphError(
          "(#100) Tried accessing nonexisting field (ad_name) on node type (LeadGenData)",
          400,
          100,
        ),
      )
      .mockResolvedValueOnce([]);

    const result = await syncFacebookLeads();

    expect(result.errors).toBe(0);
    expect(mocks.graphGetAllData).toHaveBeenCalledTimes(3);
    expect(mocks.graphGetAllData).toHaveBeenLastCalledWith("/form-1/leads", {
      fields: "id,created_time,field_data",
    });
  });

  it("surfaces pagination errors and marks a partially successful run ok", async () => {
    const { db, updated } = createDb(["existing-1"]);
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-capped" }, { id: "form-ok" }])
      .mockRejectedValueOnce(
        new FacebookGraphError(
          "Facebook Graph pagination limit (50 pages) reached; results are truncated.",
          500,
        ),
      )
      .mockResolvedValueOnce([
        {
          id: "fb-existing",
          field_data: [{ name: "phone_number", values: ["0901000000"] }],
        },
      ]);

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({ imported: 0, updated: 1, errors: 1 });
    expect(result.message).toContain("pagination limit (50 pages)");
    expect(mocks.graphGetAllData).toHaveBeenCalledTimes(3);
    expect(updated).toContainEqual({
      table: metaSyncRuns,
      values: expect.objectContaining({
        status: "ok",
        updated: 1,
        errors: 1,
        message: expect.stringContaining("pagination limit (50 pages)"),
      }),
    });
  });
});
