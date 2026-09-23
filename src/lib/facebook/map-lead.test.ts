import { describe, expect, it } from "vitest";
import { mapFacebookLeadFields } from "./map-lead";

describe("mapFacebookLeadFields", () => {
  it("maps phone and name", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
    ]);
    expect(r).toEqual({
      ok: true,
      phone: "0901234567",
      name: "Nguyen A",
      campaign: null,
      adContent: null,
    });
  });

  it("skips when phone missing", () => {
    const r = mapFacebookLeadFields([{ name: "full_name", values: ["X"] }]);
    expect(r).toEqual({ ok: false, reason: "missing_phone" });
  });

  it("accepts alternate phone keys", () => {
    const r = mapFacebookLeadFields([{ name: "phone", values: ["+84901234567"] }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.phone).toContain("84901234567");
  });
});
