import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { deduplicateAudienceContacts } from "@/lib/audiences/customer-audience";

import {
  listAccessibleAdAccounts,
  syncContactsToMetaCustomAudience,
  syncFullMetaAudienceSuite,
} from "./custom-audiences";

describe("custom-audiences", () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      FACEBOOK_ACCESS_TOKEN: "test-master-token",
      FACEBOOK_AD_ACCOUNT_ID: "123456789",
    };
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.restoreAllMocks();
  });

  it("lists accessible ad accounts from /me/adaccounts and marks default account", async () => {
    const fetchMock = vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: [
            {
              id: "act_999888777",
              account_id: "999888777",
              name: "TKQC Dự án Bất động sản",
              account_status: 1,
              currency: "VND",
            },
            {
              id: "act_123456789",
              account_id: "123456789",
              name: "TKQC Tổng Master",
              account_status: 1,
              currency: "VND",
            },
          ],
        }),
        { status: 200 },
      ),
    );

    const accounts = await listAccessibleAdAccounts();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(accounts).toHaveLength(2);
    expect(accounts[0]?.id).toBe("act_123456789");
    expect(accounts[0]?.isDefault).toBe(true);
    expect(accounts[1]?.id).toBe("act_999888777");
  });

  it("creates a new Meta Custom Audience with CRM- prefix and pushes SHA-256 hashed contacts", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "2385000011112222" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            audience_id: "2385000011112222",
            num_received: 2,
            num_invalid_entries: 0,
          }),
          { status: 200 },
        ),
      );

    const { contacts } = deduplicateAudienceContacts([
      {
        id: "1",
        name: "Nguyễn Văn A",
        phone: "0912345678",
        attrs: { email: "a@example.com" },
        category: "KHQT",
        contactStatus: "DA_LIEN_HE",
        source: "FACEBOOK",
        facebookPageId: "p1",
        createdAt: "2026-10-01T00:00:00Z",
      },
      {
        id: "2",
        name: "Lê Thị B",
        phone: "0987654321",
        attrs: {},
        category: "KHD",
        contactStatus: "DA_LIEN_HE",
        source: "FACEBOOK",
        facebookPageId: "p2",
        createdAt: "2026-10-02T00:00:00Z",
      },
    ]);

    const result = await syncContactsToMetaCustomAudience({
      adAccountId: "act_123456789",
      name: "[Dự án A - 2 Fanpage] Tệp KHQT+",
      contacts,
    });

    expect(result.createdNewAudience).toBe(true);
    expect(result.audienceId).toBe("2385000011112222");
    expect(result.uploadedCount).toBe(2);
    expect(result.numReceived).toBe(2);
    expect(result.createdItems?.[0]?.name).toBe("CRM- [Dự án A - 2 Fanpage] Tệp KHQT+");
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("executes 3-tier suite: creates CRM Seed -> Lookalike Ladder -> Saved Persona Audience", async () => {
    const fetchMock = vi
      .spyOn(globalThis, "fetch")
      // 1. Create CRM Seed Audience
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "seed-crm-100" }), { status: 200 }),
      )
      // 2. Push users to CRM Seed
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ num_received: 1, num_invalid_entries: 0 }), {
          status: 200,
        }),
      )
      // 3. Create Lookalike 1%
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "lal-0-1" }), { status: 200 }),
      )
      // 4. Create Lookalike 3-5%
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "lal-3-5" }), { status: 200 }),
      )
      // 5. Create Saved Persona Audience
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: "saved-persona-99" }), { status: 200 }),
      );

    const { contacts } = deduplicateAudienceContacts([
      {
        id: "1",
        name: "Phạm Long",
        phone: "0916721409",
        attrs: {},
        category: "KHQT",
        contactStatus: "DA_LIEN_HE",
        source: "FACEBOOK",
        facebookPageId: "105589125657497",
        createdAt: "2026-10-01T00:00:00Z",
      },
    ]);

    const res = await syncFullMetaAudienceSuite({
      adAccountId: "act_123456789",
      baseName: "Peugeot Hà Nam - Tệp Khách Hàng",
      contacts,
      pageIds: ["105589125657497"],
      pageNames: ["Peugeot Hà Nam"],
      personaConfig: {
        enableLookalike: true,
        seedSource: "auto_crm_or_page",
        lookalikeTiers: ["0_1", "3_5"],
        enableSavedAudience: true,
        ageMin: 25,
        ageMax: 44,
        gender: 1,
        regionKeys: ["3997"],
      },
    });

    expect(fetchMock).toHaveBeenCalledTimes(5);
    expect(res.createdItems).toHaveLength(4);
    expect(res.createdItems?.map((i) => i.kind)).toEqual([
      "SEED_CRM",
      "LOOKALIKE",
      "LOOKALIKE",
      "SAVED_AUDIENCE",
    ]);
    for (const item of res.createdItems ?? []) {
      expect(item.name.startsWith("CRM- ")).toBe(true);
    }
  });
});

