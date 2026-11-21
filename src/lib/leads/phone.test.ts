import { describe, expect, it } from "vitest";

import { normalizePhone, phoneKey, validatePhone } from "./phone";

describe("phone utilities", () => {
  describe("phoneKey", () => {
    it("strips non-digits and normalizes 11-digit 84 prefix to 0", () => {
      expect(phoneKey("+84 901 234 567")).toBe("0901234567");
      expect(phoneKey("84901234567")).toBe("0901234567");
      expect(phoneKey("0901.234.567")).toBe("0901234567");
      expect(phoneKey("p:+84903438685")).toBe("0903438685");
    });

    it("normalizes 12-digit 840 prefix to 0", () => {
      expect(phoneKey("+840901234567")).toBe("0901234567");
      expect(phoneKey("840901234567")).toBe("0901234567");
      expect(phoneKey("p:+840978332668")).toBe("0978332668");
    });

    it("prepends 0 on 9-digit bare VN mobile numbers instead of stripping 84", () => {
      expect(phoneKey("936884986")).toBe("0936884986");
      expect(phoneKey("841234567")).toBe("0841234567");
      expect(phoneKey("+841234567")).toBe("841234567");
    });
  });

  describe("normalizePhone", () => {
    it("normalizes valid Vietnamese +84, 840, p:+84, 9-digit, and legacy 11-digit numbers to 10-digit 0...", () => {
      expect(normalizePhone("+84 901 234 567")).toBe("0901234567");
      expect(normalizePhone("+840901234567")).toBe("0901234567");
      expect(normalizePhone("84901234567")).toBe("0901234567");
      expect(normalizePhone(" 0901-234-567 ")).toBe("0901234567");
      expect(normalizePhone("p:+84903438685")).toBe("0903438685");
      expect(normalizePhone("p:+840978332668")).toBe("0978332668");
      expect(normalizePhone("936884986")).toBe("0936884986");
      expect(normalizePhone("942900269")).toBe("0942900269");
      expect(normalizePhone("84 83 4874567")).toBe("0834874567");
      expect(normalizePhone("p:+841696969691")).toBe("0396969691");
      expect(normalizePhone("p:+841213373686")).toBe("0793373686");
    });

    it("preserves non-VN international numbers with leading + (including p:+ prefix)", () => {
      expect(normalizePhone("+1 (415) 555-2671")).toBe("+14155552671");
      expect(normalizePhone("+82 10-3516-6618")).toBe("+821035166618");
      expect(normalizePhone("+81 90-2303-1257")).toBe("+819023031257");
      expect(normalizePhone("+886 937 259 846")).toBe("+886937259846");
      expect(normalizePhone("p:+8613178681983")).toBe("+8613178681983");
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
      expect(validatePhone("p:+84903438685")).toBeNull();
    });
  });
});
