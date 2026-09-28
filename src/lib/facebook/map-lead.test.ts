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
      attrs: {},
    });
  });

  it("imports with empty phone when missing", () => {
    const r = mapFacebookLeadFields([{ name: "full_name", values: ["X"] }]);
    expect(r).toEqual({
      phone: "",
      name: "X",
      campaign: null,
      adContent: null,
      attrs: {},
    });
  });

  it("keeps unmapped form fields in attrs", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
      { name: "email", values: ["a@example.com"] },
      { name: "Thành phố", values: [" Hà Nội "] },
      { name: "xe_quan_tam", values: ["CX-5", "CX-8"] },
      { name: "ghi_chu", values: [""] },
      { name: "lead_id", values: ["123"] },
    ]);
    expect(r.attrs).toEqual({
      email: "a@example.com",
      "thành phố": "Hà Nội",
      xe_quan_tam: "CX-5, CX-8",
    });
  });

  it("accepts alternate phone keys", () => {
    const r = mapFacebookLeadFields([{ name: "phone", values: ["+84901234567"] }]);
    expect(r.phone).toContain("84901234567");
  });
});
