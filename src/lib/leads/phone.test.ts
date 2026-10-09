import { describe, expect, it } from "vitest";

import { normalizePhone, phoneKey, validatePhone } from "./phone";

describe("lead phone helpers", () => {
  it("normalizes separators and keeps a leading plus", () => {
    expect(normalizePhone(" 0901 234-567 ")).toBe("0901234567");
    expect(normalizePhone("+84 901.234.567")).toBe("+84901234567");
    expect(normalizePhone("abc")).toBe("");
  });

  it("treats +84 and 0 prefixes as the same number for duplicate checks", () => {
    expect(phoneKey("+84901234567")).toBe("0901234567");
    expect(phoneKey("0901 234 567")).toBe("0901234567");
    expect(phoneKey("84901234567")).toBe(phoneKey("0901234567"));
  });

  it("validates length", () => {
    expect(validatePhone("")).toMatch(/không được để trống/);
    expect(validatePhone("12345")).toMatch(/từ 9 đến 15/);
    expect(validatePhone("0901234567")).toBeNull();
  });
});
