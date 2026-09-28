import { describe, expect, it } from "vitest";

import { previousCalendarRange } from "./date-range";

describe("previousCalendarRange", () => {
  it("keeps the same inclusive length and ends the day before the current range", () => {
    expect(previousCalendarRange("2026-09-01", "2026-09-26")).toEqual({
      from: "2026-08-06",
      to: "2026-08-31",
    });
    expect(previousCalendarRange("2026-09-26", "2026-09-26")).toEqual({
      from: "2026-09-25",
      to: "2026-09-25",
    });
    expect(previousCalendarRange("2026-03-01", "2026-03-31")).toEqual({
      from: "2026-01-29",
      to: "2026-02-28",
    });
  });

  it("returns an empty range when the dates are not a forward calendar span", () => {
    expect(previousCalendarRange("2026-09-26", "2026-09-01")).toEqual({ from: null, to: null });
  });
});
