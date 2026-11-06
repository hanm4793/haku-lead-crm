import { describe, expect, it } from "vitest";

import {
  extractMentionedUserIds,
  formatVnClockTime,
  resolveDailyDigestWindow,
} from "@/lib/push/helpers";

describe("extractMentionedUserIds", () => {
  const candidates = [
    { appUserId: "u-ha", fullName: "Nguyễn Minh Hà", email: "hanm08@semtop.vn" },
    { appUserId: "u-linh", fullName: "Trần Đỗ Linh", email: "linhtd@semtop.vn" },
    { appUserId: "u-an", fullName: "Nguyễn Văn An", email: "annv@semtop.vn" },
  ];

  it("matches exact Vietnamese diacritic @FullName and unaccented @fullname", () => {
    expect(
      extractMentionedUserIds(
        "@Nguyễn Minh Hà kiểm tra khách này giúp em nhé!",
        candidates,
      ),
    ).toEqual(["u-ha"]);

    expect(
      extractMentionedUserIds(
        "Nhờ @tran do linh gọi lại lúc 2h chiều",
        candidates,
      ),
    ).toEqual(["u-linh"]);
  });

  it("matches multiple mentions and @email_prefix in the same comment", () => {
    const matched = extractMentionedUserIds(
      "@hanm08 và @Nguyễn Văn An chốt lịch lái thử nhé",
      candidates,
    );
    expect(new Set(matched)).toEqual(new Set(["u-ha", "u-an"]));
  });

  it("returns empty array when no @ symbol or no matching candidate", () => {
    expect(extractMentionedUserIds("Khách hẹn mai gọi lại", candidates)).toEqual([]);
    expect(extractMentionedUserIds("@Người Lạ ơi", candidates)).toEqual([]);
  });
});

describe("resolveDailyDigestWindow & formatVnClockTime", () => {
  it("resolves morning digest window at 08:30 Vietnam time (01:30 UTC)", () => {
    const morningUtc = new Date("2026-11-06T01:30:00.000Z");
    expect(resolveDailyDigestWindow(morningUtc)).toEqual({
      dateKey: "2026-11-06",
      slot: "morning",
    });
    expect(formatVnClockTime(morningUtc)).toBe("08:30");
  });

  it("resolves afternoon digest window at 14:00 Vietnam time (07:00 UTC)", () => {
    const afternoonUtc = new Date("2026-11-06T07:00:00.000Z");
    expect(resolveDailyDigestWindow(afternoonUtc)).toEqual({
      dateKey: "2026-11-06",
      slot: "afternoon",
    });
    expect(formatVnClockTime(afternoonUtc)).toBe("14:00");
  });

  it("returns null outside morning and afternoon digest windows", () => {
    const noonUtc = new Date("2026-11-06T05:00:00.000Z"); // 12:00 VN
    const nightUtc = new Date("2026-11-06T15:00:00.000Z"); // 22:00 VN
    expect(resolveDailyDigestWindow(noonUtc)).toBeNull();
    expect(resolveDailyDigestWindow(nightUtc)).toBeNull();
  });
});
