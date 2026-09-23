import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getViewer: vi.fn(),
  purgeSampleLeads: vi.fn(),
  revalidatePath: vi.fn(),
  syncFacebookInsights: vi.fn(),
  syncFacebookLeads: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/auth/viewer", () => ({ getViewer: mocks.getViewer }));
vi.mock("@/lib/facebook/purge-sample-leads", () => ({
  purgeSampleLeads: mocks.purgeSampleLeads,
}));
vi.mock("@/lib/facebook/sync-insights", () => ({
  syncFacebookInsights: mocks.syncFacebookInsights,
}));
vi.mock("@/lib/facebook/sync-leads", () => ({
  syncFacebookLeads: mocks.syncFacebookLeads,
}));

import {
  purgeSampleLeadsAction,
  syncFacebookInsightsAction,
  syncFacebookLeadsAction,
} from "./facebook-actions";

describe("Facebook settings actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("rejects non-admin viewers without starting a sync", async () => {
    mocks.getViewer.mockResolvedValue({ role: "SALES" });

    await expect(syncFacebookLeadsAction()).resolves.toEqual({
      ok: false,
      error: "Chỉ ADMIN mới đồng bộ dữ liệu Facebook.",
    });
    expect(mocks.syncFacebookLeads).not.toHaveBeenCalled();
  });

  it("runs sync for admins and revalidates affected pages", async () => {
    mocks.getViewer.mockResolvedValue({ role: "ADMIN" });
    const result = {
      imported: 2,
      updated: 1,
      skipped: 1,
      errors: 0,
      message: "Done.",
      runId: "run-1",
    };
    mocks.syncFacebookLeads.mockResolvedValue(result);

    await expect(syncFacebookLeadsAction()).resolves.toEqual({ ok: true, result });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/leads");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("purges sample leads for admins", async () => {
    mocks.getViewer.mockResolvedValue({ role: "ADMIN" });
    mocks.purgeSampleLeads.mockResolvedValue({ deleted: 4 });

    await expect(purgeSampleLeadsAction()).resolves.toEqual({ ok: true, deleted: 4 });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/leads");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });

  it("rejects Insights sync for non-admin viewers", async () => {
    mocks.getViewer.mockResolvedValue({ role: "SALES" });

    await expect(syncFacebookInsightsAction()).resolves.toEqual({
      ok: false,
      error: "Chỉ ADMIN mới đồng bộ dữ liệu Facebook.",
    });
    expect(mocks.syncFacebookInsights).not.toHaveBeenCalled();
  });

  it("runs Insights sync for admins and revalidates Marketing", async () => {
    mocks.getViewer.mockResolvedValue({ role: "ADMIN" });
    const result = {
      imported: 1,
      updated: 2,
      skipped: 0,
      errors: 0,
      message: "Done.",
      runId: "run-2",
      since: "2026-08-25",
      until: "2026-09-23",
    };
    mocks.syncFacebookInsights.mockResolvedValue(result);

    await expect(syncFacebookInsightsAction()).resolves.toEqual({ ok: true, result });
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/marketing");
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/settings");
  });
});
