import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ getDb: vi.fn() }));

vi.mock("@/lib/db/client", () => ({ getDb: mocks.getDb }));

import { purgeSampleLeads } from "./purge-sample-leads";

describe("purgeSampleLeads", () => {
  it("is disabled and throws without deleting leads from the database", async () => {
    const deleteFrom = vi.fn();
    mocks.getDb.mockReturnValue({ delete: deleteFrom });

    await expect(purgeSampleLeads()).rejects.toThrow(
      "Tính năng xóa lead mẫu đã bị vô hiệu hóa để bảo vệ dữ liệu.",
    );
    expect(deleteFrom).not.toHaveBeenCalled();
  });
});
