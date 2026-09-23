import { describe, expect, it, vi } from "vitest";

import { leads } from "@/lib/db/schema";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));

import { purgeSampleLeads } from "./purge-sample-leads";

describe("purgeSampleLeads", () => {
  it("deletes only leads without a Facebook lead id and returns the count", async () => {
    const returning = vi.fn(async () => [{ id: "sample-1" }, { id: "sample-2" }]);
    const where = vi.fn(() => ({ returning }));
    const deleteFrom = vi.fn(() => ({ where }));
    mocks.getDb.mockReturnValue({ delete: deleteFrom });

    await expect(purgeSampleLeads()).resolves.toEqual({ deleted: 2 });
    expect(deleteFrom).toHaveBeenCalledWith(leads);
    expect(where).toHaveBeenCalledOnce();
  });
});
