import { describe, expect, it } from "vitest";
import { mapFacebookLeadFields } from "./map-lead";

describe("mapFacebookLeadFields", () => {
  it("maps phone and name", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
    ]);
    expect(r).toEqual({
      phone: "0901234567",
      name: "Nguyen A",
      campaign: null,
      adContent: null,
    });
  });

  it("imports with empty phone when missing", () => {
    const r = mapFacebookLeadFields([{ name: "full_name", values: ["X"] }]);
    expect(r).toEqual({
      phone: "",
      name: "X",
      campaign: null,
      adContent: null,
    });
  });

  it("accepts alternate phone keys", () => {
    const r = mapFacebookLeadFields([{ name: "phone", values: ["+84901234567"] }]);
    expect(r.phone).toContain("84901234567");
  });
});
