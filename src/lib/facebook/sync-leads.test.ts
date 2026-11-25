import { beforeEach, describe, expect, it, vi } from "vitest";
import { PgDialect } from "drizzle-orm/pg-core";
import type { SQL } from "drizzle-orm";

import { activityLogs, leads, metaSyncRuns } from "@/lib/db/schema";
import { FacebookGraphError } from "./graph-client";

const mocks = vi.hoisted(() => ({
  getDb: vi.fn(),
  getFacebookConfig: vi.fn(),
  graphGet: vi.fn(),
  graphGetAllData: vi.fn(),
  resolveActiveFacebookPageIds: vi.fn(),
  getFacebookPageProjectId: vi.fn(),
  resolvePageAccessTokens: vi.fn(),
  getDefaultProject: vi.fn(),
}));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));
vi.mock("./env", () => ({ getFacebookConfig: mocks.getFacebookConfig }));
vi.mock("@/lib/db/facebook-pages-repo", () => ({
  resolveActiveFacebookPageIds: mocks.resolveActiveFacebookPageIds,
  getFacebookPageProjectId: mocks.getFacebookPageProjectId,
}));
vi.mock("@/lib/db/project-repo", () => ({ getDefaultProject: mocks.getDefaultProject }));
vi.mock("./page-tokens", () => ({
  resolvePageAccessTokens: mocks.resolvePageAccessTokens,
}));
vi.mock("./graph-client", async (importOriginal) => {
  const original = await importOriginal<typeof import("./graph-client")>();
  return { ...original, graphGet: mocks.graphGet, graphGetAllData: mocks.graphGetAllData };
});

import { syncFacebookLeads } from "./sync-leads";

function createDb(
  existingRows: Array<string | Record<string, unknown>> = [],
) {
  const inserted: Array<{
    table: unknown;
    values: Record<string, unknown>;
    inTransaction: boolean;
  }> = [];
  const updated: Array<{ table: unknown; values: Record<string, unknown> }> = [];
  const existing = existingRows.map((item) =>
    typeof item === "string" ? { id: item } : item,
  );
  let transactionDepth = 0;

  const limitFn = vi.fn(async () => {
    const row = existing.shift();
    return row ? [row] : [];
  });

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
          orderBy: vi.fn(() => ({ limit: limitFn })),
          limit: limitFn,
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
    mocks.graphGet.mockResolvedValue({ data: [] });
    mocks.resolveActiveFacebookPageIds.mockResolvedValue(["page-1"]);
    mocks.resolvePageAccessTokens.mockResolvedValue(
      new Map([["page-1", { token: "page-token-1", name: "Page One" }]]),
    );
    mocks.getDefaultProject.mockResolvedValue({ id: "project-1", slug: "semtop-auto" });
    mocks.getFacebookPageProjectId.mockResolvedValue("project-1");
  });

  it("imports leads including those without phone", async () => {
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
            { name: "email", values: ["a@example.com"] },
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
      imported: 2,
      updated: 0,
      skipped: 0,
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
        projectId: "project-1",
        brandId: null,
        productId: null,
        locationId: null,
        assigneeId: null,
        attrs: { email: "a@example.com" },
        costPerLead: null,
      }),
      inTransaction: true,
    });
    expect(inserted).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        facebookLeadId: "fb-2",
        phone: "",
        name: "No phone",
        attrs: {},
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
    expect(db.transaction).toHaveBeenCalledTimes(2);
    expect(updated).toContainEqual({
      table: metaSyncRuns,
      values: expect.objectContaining({
        status: "ok",
        imported: 2,
        skipped: 0,
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
    expect(leadUpdate).not.toHaveProperty("locationId");
    expect(leadUpdate).not.toHaveProperty("brandId");
    expect(leadUpdate).not.toHaveProperty("productId");
    expect(leadUpdate).not.toHaveProperty("assigneeId");
    expect(leadUpdate).not.toHaveProperty("attrs");
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
    expect(mocks.graphGetAllData).toHaveBeenLastCalledWith(
      "/form-1/leads",
      { fields: "id,created_time,field_data" },
      { accessToken: "page-token-1" },
    );
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

  it("imports Messenger (TIN_NHAN) and Post Comment (COMMENT) leads alongside Form leads", async () => {
    const { db, inserted } = createDb();
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData.mockResolvedValueOnce([]);
    mocks.graphGet
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv-1",
            updated_time: "2026-10-18T10:00:00+0000",
            participants: { data: [{ id: "page-1" }, { id: "cust-1", name: "Khách Messenger" }] },
            messages: {
              data: [
                {
                  id: "m-1",
                  message: "Báo giá xe Mazda CX5 số 0912345678",
                  created_time: "2026-10-18T10:00:00+0000",
                  from: { id: "cust-1", name: "Khách Messenger" },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({
        data: [{ id: "post-1", message: "Khuyến mãi tháng 10" }],
      })
      .mockResolvedValueOnce({
        data: [
          {
            id: "cmt-1",
            message: "Tư vấn trả góp giúp mình 0987654321",
            created_time: "2026-10-18T11:00:00+0000",
            from: { id: "cust-2", name: "Khách Comment" },
          },
        ],
      });

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({
      imported: 2,
      updated: 0,
      errors: 0,
      byChannel: { form: 0, message: 1, comment: 1 },
    });
    expect(inserted).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        facebookLeadId: "msg_conv-1",
        name: "Khách Messenger",
        phone: "0912345678",
        source: "FACEBOOK",
        channelDetail: "TIN_NHAN",
      }),
      inTransaction: true,
    });
    expect(inserted).toContainEqual({
      table: leads,
      values: expect.objectContaining({
        facebookLeadId: "cmt_cmt-1",
        name: "Khách Comment",
        phone: "0987654321",
        source: "FACEBOOK",
        channelDetail: "COMMENT",
      }),
      inTransaction: true,
    });
  });

  it("deduplicates Messenger auto-echo and follow-up chats into existing Form lead with same normalized phone", async () => {
    // 1st select (Form lead): not found -> inserts Form lead (+84985909293 normalized to 0985909293)
    // 2nd select (Messenger echo with 098 590 92 93): matches the Form lead by phoneKey -> updates Form lead instead of inserting duplicate!
    const { db, inserted, updated } = createDb([
      undefined as unknown as Record<string, unknown>,
      {
        id: "lead-new",
        facebookLeadId: "form-lead-1",
        channelDetail: "FORM",
        name: "Vũ Minh Toàn",
        phone: "0985909293",
        careNote: "Khách hẹn chiều gọi lại",
        attrs: { dong_xe: "Kia Sonet" },
      },
    ]);
    mocks.getDb.mockReturnValue(db);
    mocks.graphGetAllData
      .mockResolvedValueOnce([{ id: "form-1" }])
      .mockResolvedValueOnce([
        {
          id: "form-lead-1",
          created_time: "2026-11-17T16:34:32+0000",
          field_data: [
            { name: "full_name", values: ["Vũ Minh Toàn"] },
            { name: "phone_number", values: ["+84985909293"] },
            { name: "dong_xe", values: ["Kia Sonet"] },
          ],
          campaign_name: "KIA Quảng Ninh T11",
        },
      ]);
    mocks.graphGet
      .mockResolvedValueOnce({
        data: [
          {
            id: "t_151451",
            updated_time: "2026-11-17T16:34:46+0000",
            link: "/594731690545560/inbox/298643/?section=messages",
            participants: {
              data: [
                { id: "page-1" },
                { id: "psid_999", name: "Minh Toàn" },
              ],
            },
            messages: {
              data: [
                {
                  id: "m_echo",
                  message:
                    "Xin chào! Tôi đã điền mẫu và muốn biết thêm về doanh nghiệp bạn.\nFull name: Vũ Minh Toàn\nPhone number: 098 590 92 93",
                  created_time: "2026-11-17T16:34:46+0000",
                  from: { id: "psid_999", name: "Minh Toàn" },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const result = await syncFacebookLeads();

    expect(result).toMatchObject({
      imported: 1,
      updated: 1,
      errors: 0,
      byChannel: { form: 1, message: 1, comment: 0 },
    });
    const leadInserts = inserted.filter((entry) => entry.table === leads);
    expect(leadInserts).toHaveLength(1);
    expect(leadInserts[0]?.values).toMatchObject({
      facebookLeadId: "form-lead-1",
      name: "Vũ Minh Toàn",
      phone: "0985909293",
      channelDetail: "FORM",
      campaign: "KIA Quảng Ninh T11",
    });

    const leadUpdates = updated.filter((entry) => entry.table === leads);
    expect(leadUpdates).toHaveLength(1);
    // Preserves Form full name & Sale's careNote, attaches Messenger link_inbox + psid without redundant form echo text
    expect(leadUpdates[0]?.values).not.toHaveProperty("name");
    expect(leadUpdates[0]?.values).toMatchObject({
      careNote: "Khách hẹn chiều gọi lại",
      attrs: {
        dong_xe: "Kia Sonet",
        psid: "psid_999",
        link_inbox: "https://business.facebook.com/594731690545560/inbox/298643/?section=messages",
      },
    });
  });

  it("scopes phone deduplication per Fanpage so 1 customer messaging 2 Fanpages in the same project creates 2 leads", async () => {
    const dialect = new PgDialect();
    const compiledQueries: Array<{ sql: string; params: unknown[] }> = [];
    // Simulate a live in-memory leads store filtered by facebookPageId + phone
    const storedLeads: Array<{
      id: string;
      facebookLeadId: string;
      facebookPageId: string;
      projectId: string;
      phone: string;
      name: string | null;
      channelDetail: string;
      attrs: Record<string, string>;
    }> = [];

    let txDepth = 0;
    const db = {
      insert: vi.fn((table: unknown) => ({
        values: vi.fn((values: Record<string, unknown>) => {
          if (table === leads) {
            storedLeads.push({
              id: `lead-${storedLeads.length + 1}`,
              facebookLeadId: String(values.facebookLeadId ?? ""),
              facebookPageId: String(values.facebookPageId ?? ""),
              projectId: String(values.projectId ?? ""),
              phone: String(values.phone ?? ""),
              name: (values.name as string | null) ?? null,
              channelDetail: String(values.channelDetail ?? ""),
              attrs: (values.attrs as Record<string, string>) ?? {},
            });
          }
          return {
            returning: vi.fn(async () =>
              table === metaSyncRuns
                ? [{ id: "run-multi-page" }]
                : [{ id: `lead-${storedLeads.length}` }],
            ),
          };
        }),
      })),
      select: vi.fn(() => ({
        from: vi.fn(() => ({
          where: vi.fn((clause: SQL) => {
            const compiled = dialect.sqlToQuery(clause);
            compiledQueries.push(compiled);
            const matched = storedLeads.find(
              (l) =>
                compiled.params.includes(l.facebookLeadId) ||
                (compiled.params.includes(l.facebookPageId) && compiled.params.includes(l.phone)),
            );
            const limit = vi.fn(async () => (matched ? [matched] : []));
            return {
              orderBy: vi.fn(() => ({ limit })),
              limit,
            };
          }),
        })),
      })),
      update: vi.fn(() => ({
        set: vi.fn(() => ({ where: vi.fn(async () => undefined) })),
      })),
      transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => {
        txDepth += 1;
        try {
          return await cb(db);
        } finally {
          txDepth -= 1;
        }
      }),
    };

    expect(txDepth).toBe(0);
    mocks.getDb.mockReturnValue(db);
    mocks.resolveActiveFacebookPageIds.mockResolvedValue(["page-kia", "page-mazda"]);
    mocks.resolvePageAccessTokens.mockResolvedValue(
      new Map([
        ["page-kia", { token: "tok-kia", name: "Kia Hòa Bình" }],
        ["page-mazda", { token: "tok-mazda", name: "MAZDA HÒA BÌNH" }],
      ]),
    );
    // Both fanpages belong to the exact same project!
    mocks.getFacebookPageProjectId.mockResolvedValue("project-hoa-binh");
    mocks.graphGetAllData.mockResolvedValue([]);

    // 1st page (page-kia): Messenger conversation with phone 0981486066 + posts empty
    // 2nd page (page-mazda): Messenger conversation from SAME phone 0981486066 + posts empty
    mocks.graphGet
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv_kia_1",
            updated_time: "2026-11-23T02:00:00+0000",
            participants: { data: [{ id: "page-kia" }, { id: "psid_1", name: "Anh Nam" }] },
            messages: {
              data: [
                {
                  id: "m1",
                  message: "Báo giá Kia Carnival giúp anh 0981486066",
                  created_time: "2026-11-23T02:00:00+0000",
                  from: { id: "psid_1", name: "Anh Nam" },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] })
      .mockResolvedValueOnce({
        data: [
          {
            id: "conv_mazda_1",
            updated_time: "2026-11-23T02:05:00+0000",
            participants: { data: [{ id: "page-mazda" }, { id: "psid_2", name: "Anh Nam" }] },
            messages: {
              data: [
                {
                  id: "m2",
                  message: "Tư vấn CX-5 cho anh số 0981486066",
                  created_time: "2026-11-23T02:05:00+0000",
                  from: { id: "psid_2", name: "Anh Nam" },
                },
              ],
            },
          },
        ],
      })
      .mockResolvedValueOnce({ data: [] });

    const res = await syncFacebookLeads({ projectId: "project-hoa-binh" });

    expect(res).toMatchObject({
      imported: 2,
      updated: 0,
      errors: 0,
      byChannel: { form: 0, message: 2, comment: 0 },
    });
    expect(storedLeads).toHaveLength(2);
    expect(storedLeads.map((l) => l.facebookPageId)).toEqual(["page-kia", "page-mazda"]);
    // Verify SQL query uses facebook_page_id and NOT project_id for deduplication
    for (const q of compiledQueries) {
      expect(q.sql).toContain('"leads"."facebook_page_id"');
      expect(q.sql).not.toContain('"leads"."project_id"');
    }
  });
});

