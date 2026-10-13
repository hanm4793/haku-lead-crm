import { describe, expect, it } from "vitest";

import { normalizePhone, phoneKey, validatePhone } from "./phone";

describe("phone utilities", () => {
  describe("phoneKey", () => {
    it("strips non-digits and normalizes 11-digit 84 prefix to 0", () => {
      expect(phoneKey("+84 901 234 567")).toBe("0901234567");
      expect(phoneKey("84901234567")).toBe("0901234567");
      expect(phoneKey("0901.234.567")).toBe("0901234567");
    });

    it("normalizes 12-digit 840 prefix to 0", () => {
      expect(phoneKey("+840901234567")).toBe("0901234567");
      expect(phoneKey("840901234567")).toBe("0901234567");
    });

    it("does not strip 84 prefix on 9-digit numbers", () => {
      expect(phoneKey("841234567")).toBe("841234567");
    });
  });

  describe("normalizePhone", () => {
    it("normalizes valid Vietnamese +84 and 840 numbers to 0...", () => {
      expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
      expect(normalizePhone("+840901234567")).toBe("0901234567");
      expect(normalizePhone("84901234567")).toBe("0901234567");
      expect(normalizePhone(" 0901-234-567 ")).toBe("0901234567");
    });

    it("preserves non-VN international numbers with leading +", () => {
      expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
    });

    it("returns empty string for empty input", () => {
      expect(normalizePhone("   ")).toBe("");
    });
  });

  describe("validatePhone", () => {
    it("accepts 9 to 15 digits and rejects invalid lengths", () => {
      expect(validatePhone("")).toBe("Số điện thoại không được để trống.");
      expect(validatePhone("12345678")).toBe("Số điện thoại phải có từ 9 đến 15 chữ số.");
      expect(validatePhone("0901234567")).toBeNull();
      expect(validatePhone("+84 901 234 567")).toBeNull();
    });
  });
});
