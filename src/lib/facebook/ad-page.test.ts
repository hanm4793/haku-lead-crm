import { describe, expect, it } from "vitest";

import { pageIdFromCreative } from "./ad-page";

describe("pageIdFromCreative", () => {
  it("prefers the page id on the creative story spec", () => {
    expect(
      pageIdFromCreative({
        actor_id: "111",
        effective_object_story_id: "222_999",
        object_story_spec: { page_id: "333" },
      }),
    ).toBe("333");
  });

  it("reads a stringified story spec, then actor id, then the story prefix", () => {
    expect(pageIdFromCreative({ object_story_spec: JSON.stringify({ page_id: "444" }) })).toBe("444");
    expect(pageIdFromCreative({ actor_id: "55555" })).toBe("55555");
    expect(pageIdFromCreative({ effective_object_story_id: "66666_post" })).toBe("66666");
    expect(pageIdFromCreative(null)).toBeNull();
  });
});
