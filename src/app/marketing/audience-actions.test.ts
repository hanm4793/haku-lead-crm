import { beforeEach, describe, expect, it, vi } from "vitest";

const getScopedViewerMock = vi.fn();
const createAudienceSegmentsMock = vi.fn();
const syncAudienceSegmentToMetaMock = vi.fn();
const previewAudienceSegmentMock = vi.fn();

vi.mock("next/cache", () => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/auth/viewer", () => ({
  getScopedViewer: () => getScopedViewerMock(),
}));

vi.mock("@/lib/db/audiences-repo", () => ({
  createAudienceSegments: (...args: unknown[]) => createAudienceSegmentsMock(...args),
  syncAudienceSegmentToMeta: (...args: unknown[]) => syncAudienceSegmentToMetaMock(...args),
  previewAudienceSegment: (...args: unknown[]) => previewAudienceSegmentMock(...args),
  listAudienceSegments: vi.fn(),
  updateAudienceSegment: vi.fn(),
  deleteAudienceSegment: vi.fn(),
}));

vi.mock("@/lib/facebook/custom-audiences", () => ({
  listAccessibleAdAccounts: vi.fn(async () => [
    {
      id: "act_123456789",
      accountId: "123456789",
      name: "TKQC Tổng Master",
      accountStatus: 1,
      currency: "VND",
      isDefault: true,
    },
  ]),
}));

import {
  createAudienceSegmentAction,
  listAdAccountsForAudienceAction,
  previewAudienceAction,
} from "./audience-actions";

describe("audience-actions RBAC & workflow", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("blocks PARTNER_ADMIN and STAFF from accessing audience actions", async () => {
    for (const role of ["PARTNER_ADMIN", "STAFF"] as const) {
      getScopedViewerMock.mockResolvedValueOnce({
        role,
        appUserId: "user-1",
        pageIds: ["page-1"],
      });
      const res = await listAdAccountsForAudienceAction();
      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.error).toMatch(/Super Admin/);
      }
    }
  });

  it("allows SUPER_ADMIN to preview, create merged/split multi-fanpage segments, and sync immediately", async () => {
    getScopedViewerMock.mockResolvedValue({
      role: "SUPER_ADMIN",
      appUserId: "super-1",
      pageIds: [],
    });

    previewAudienceSegmentMock.mockResolvedValueOnce({
      stats: {
        totalMatchedLeads: 150,
        uniqueContacts: 142,
        duplicatesRemoved: 8,
        skippedInvalid: 0,
        validPhones: 142,
        validEmails: 60,
        withFacebookLeadId: 130,
      },
      byFanpage: [
        { facebookPageId: "p1", facebookPageName: "Page 1", rawLeadCount: 80, uniqueContactCount: 78 },
        { facebookPageId: "p2", facebookPageName: "Page 2", rawLeadCount: 70, uniqueContactCount: 64 },
      ],
      sampleContacts: [],
    });

    const previewRes = await previewAudienceAction({
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      filters: {
        facebookPageIds: ["p1", "p2"],
        categories: ["KHQT", "GDTD", "KHD"],
      },
    });
    expect(previewRes.ok).toBe(true);
    if (previewRes.ok) {
      expect(previewRes.preview.stats.uniqueContacts).toBe(142);
    }

    createAudienceSegmentsMock.mockResolvedValueOnce({
      createdIds: ["seg-1"],
      count: 1,
    });
    syncAudienceSegmentToMetaMock.mockResolvedValueOnce({
      audienceId: "fb-aud-1",
      adAccountId: "act_123456789",
      uploadedCount: 142,
      numReceived: 142,
      numInvalidEntries: 0,
      batches: 1,
      createdNewAudience: true,
    });

    const createRes = await createAudienceSegmentAction({
      name: "[Dự án A · Gộp 2 Fanpage] Khách chất lượng (KHQT+)",
      projectId: "550e8400-e29b-41d4-a716-446655440000",
      filters: {
        facebookPageIds: ["p1", "p2"],
        categories: ["KHQT", "GDTD", "KHD"],
      },
      facebookAdAccountId: "act_123456789",
      mode: "merge",
      syncImmediately: true,
    });

    expect(createRes.ok).toBe(true);
    if (createRes.ok) {
      expect(createRes.count).toBe(1);
      expect(createRes.syncedCount).toBe(1);
    }
    expect(createAudienceSegmentsMock).toHaveBeenCalledTimes(1);
    expect(syncAudienceSegmentToMetaMock).toHaveBeenCalledWith({
      segmentId: "seg-1",
      adAccountId: "act_123456789",
    });
  });
});
