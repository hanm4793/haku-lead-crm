import { describe, expect, it } from "vitest";

import {
  buildMetaCustomAudiencePayload,
  chunkMetaAudiencePayload,
  deduplicateAudienceContacts,
  extractAudienceEmail,
  formatAudienceExport,
  normalizeAudiencePhone,
  sha256Hex,
  splitAudienceName,
  type RawAudienceLead,
} from "./customer-audience";

describe("normalizeAudiencePhone", () => {
  it("normalizes standard Vietnamese mobile numbers across 0, 84, +84, 840, and 9-digit formats", () => {
    const expected = {
      local: "0912345678",
      digitsIntl: "84912345678",
      e164: "+84912345678",
    };
    expect(normalizeAudiencePhone("0912 345 678")).toEqual(expected);
    expect(normalizeAudiencePhone("+84 912-345-678")).toEqual(expected);
    expect(normalizeAudiencePhone("84912345678")).toEqual(expected);
    expect(normalizeAudiencePhone("840912345678")).toEqual(expected);
    expect(normalizeAudiencePhone("912345678")).toEqual(expected);
  });

  it("rejects short or invalid garbage strings", () => {
    expect(normalizeAudiencePhone("")).toBeNull();
    expect(normalizeAudiencePhone("12345")).toBeNull();
    expect(normalizeAudiencePhone("khong co sdt")).toBeNull();
  });
});

describe("extractAudienceEmail & splitAudienceName", () => {
  it("extracts and lowercases valid email from attrs", () => {
    expect(extractAudienceEmail({ Email: "  KhachHang@Gmail.com " })).toBe("khachhang@gmail.com");
    expect(extractAudienceEmail({ dia_chi_email: "test@company.vn" })).toBe("test@company.vn");
    expect(extractAudienceEmail({ email: "not-an-email" })).toBeNull();
  });

  it("splits Vietnamese names into lastName and firstName", () => {
    expect(splitAudienceName("  Nguyễn   Văn Minh ")).toEqual({
      fullName: "Nguyễn Văn Minh",
      lastName: "Nguyễn",
      firstName: "Văn Minh",
    });
    expect(splitAudienceName("Hùng")).toEqual({
      fullName: "Hùng",
      lastName: null,
      firstName: "Hùng",
    });
    expect(splitAudienceName("")).toEqual({
      fullName: null,
      lastName: null,
      firstName: null,
    });
  });
});

describe("deduplicateAudienceContacts & multi-fanpage merge", () => {
  const sampleLeads: RawAudienceLead[] = [
    {
      id: "lead-1",
      name: "Nguyễn Văn A",
      phone: "0988111222",
      attrs: {},
      category: "KHQT",
      contactStatus: "DA_LIEN_HE",
      source: "FACEBOOK",
      facebookPageId: "page-1",
      facebookPageName: "Fanpage Kia Cầu Diễn",
      facebookLeadId: "fb-lead-1",
      createdAt: "2026-10-01T08:00:00Z",
    },
    {
      id: "lead-2",
      // Cùng SĐT ở định dạng +84 từ Fanpage thứ 2 trong cùng dự án, có thêm email và đã chốt KHD
      name: null,
      phone: "+84 988 111 222",
      attrs: { email: "nguyenvana@gmail.com" },
      category: "KHD",
      contactStatus: "DA_LIEN_HE",
      source: "FACEBOOK",
      facebookPageId: "page-2",
      facebookPageName: "Fanpage Kia Long Biên",
      facebookLeadId: null,
      createdAt: "2026-10-05T09:00:00Z",
    },
    {
      id: "lead-3",
      name: "Trần Thị B",
      phone: "0912999888",
      attrs: { email: "tranthib@example.com" },
      category: "GDTD",
      contactStatus: "DA_LIEN_HE",
      source: "FACEBOOK",
      facebookPageId: "page-1",
      facebookPageName: "Fanpage Kia Cầu Diễn",
      facebookLeadId: "fb-lead-3",
      createdAt: "2026-10-06T10:00:00Z",
    },
    {
      id: "lead-invalid",
      name: "Khách lỗi SĐT",
      phone: "123",
      attrs: {},
      category: "CHUA_PHAN_LOAI",
      contactStatus: "CHUA_LIEN_HE",
      source: "MANUAL",
      createdAt: "2026-10-07T10:00:00Z",
    },
  ];

  it("merges duplicate phone numbers across multiple fanpages and enriches fields", () => {
    const result = deduplicateAudienceContacts(sampleLeads);

    expect(result.stats.totalMatchedLeads).toBe(4);
    expect(result.stats.uniqueContacts).toBe(2);
    expect(result.stats.duplicatesRemoved).toBe(1);
    expect(result.stats.skippedInvalid).toBe(1);
    expect(result.stats.validPhones).toBe(2);
    expect(result.stats.validEmails).toBe(2);
    expect(result.stats.withFacebookLeadId).toBe(2);

    const merged = result.contacts.find((c) => c.phoneLocal === "0988111222");
    expect(merged).toBeDefined();
    expect(merged?.fullName).toBe("Nguyễn Văn A");
    expect(merged?.email).toBe("nguyenvana@gmail.com");
    expect(merged?.category).toBe("KHD"); // Nâng lên phân loại cao nhất
    expect(merged?.facebookLeadId).toBe("fb-lead-1");
    expect(merged?.phoneDigitsIntl).toBe("84988111222");
    expect(merged?.phoneE164).toBe("+84988111222");
    expect(merged?.phoneSha256).toBe(sha256Hex("84988111222"));

    expect(result.byFanpage).toHaveLength(3);
    const page1 = result.byFanpage.find((p) => p.facebookPageId === "page-1");
    expect(page1?.rawLeadCount).toBe(2);
    expect(page1?.uniqueContactCount).toBe(2);
  });

  it("builds SHA-256 hashed Meta Custom Audience payload and multi-platform exports", () => {
    const { contacts } = deduplicateAudienceContacts(sampleLeads);
    const payload = buildMetaCustomAudiencePayload(contacts);

    expect(payload.schema).toEqual(["PHONE", "EMAIL", "FN", "LN", "COUNTRY"]);
    expect(payload.data).toHaveLength(2);
    expect(payload.data[0]?.[0]).toBe(sha256Hex("84988111222"));
    expect(payload.data[0]?.[1]).toBe(sha256Hex("nguyenvana@gmail.com"));
    expect(payload.data[0]?.[4]).toBe(sha256Hex("vn"));

    const chunks = chunkMetaAudiencePayload(contacts, 1);
    expect(chunks).toHaveLength(2);

    const googleExport = formatAudienceExport(contacts, "google_csv");
    expect(googleExport.extension).toBe("csv");
    expect(googleExport.content).toContain("Email,Phone,First Name,Last Name,Country,Zip");
    expect(googleExport.content).toContain("nguyenvana@gmail.com,+84988111222,Văn A,Nguyễn,VN,");

    const zaloExport = formatAudienceExport(contacts, "zalo_txt");
    expect(zaloExport.extension).toBe("txt");
    expect(zaloExport.content).toBe("0988111222\r\n0912999888");
  });
});
