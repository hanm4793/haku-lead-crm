import { createHash } from "node:crypto";

import type { ContactStatus, FailReason, LeadCategory, LeadSource } from "@/lib/types";

export type AudienceExportFormat = "meta_csv" | "google_csv" | "tiktok_csv" | "zalo_txt";

export interface NormalizedAudiencePhone {
  /** Số nội địa đầu 0 (VD: "0912345678") — dùng làm khóa khử trùng và xuất Zalo Ads */
  local: string;
  /** Số quốc tế chỉ gồm chữ số (VD: "84912345678") — chuẩn băm SHA-256 của Meta Custom Audience */
  digitsIntl: string;
  /** Số quốc tế chuẩn E.164 có dấu cộng (VD: "+84912345678") — chuẩn Google Customer Match & TikTok Ads */
  e164: string;
}

export interface RawAudienceLead {
  id: string;
  name: string | null;
  phone: string;
  attrs?: Record<string, string> | null;
  category: LeadCategory;
  contactStatus: ContactStatus;
  failReason?: FailReason | null;
  source: LeadSource;
  facebookPageId?: string | null;
  facebookPageName?: string | null;
  facebookLeadId?: string | null;
  createdAt: Date | string;
}

export interface AudienceContact {
  key: string;
  leadId: string;
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
  phoneLocal: string | null;
  phoneDigitsIntl: string | null;
  phoneE164: string | null;
  phoneSha256: string | null;
  email: string | null;
  emailSha256: string | null;
  category: LeadCategory;
  source: LeadSource;
  facebookPageId: string | null;
  facebookPageName: string | null;
  facebookLeadId: string | null;
  createdAt: string;
}

export interface AudienceFanpageBreakdown {
  facebookPageId: string;
  facebookPageName: string;
  rawLeadCount: number;
  uniqueContactCount: number;
}

export interface AudienceBuildResult {
  contacts: AudienceContact[];
  stats: {
    totalMatchedLeads: number;
    uniqueContacts: number;
    duplicatesRemoved: number;
    skippedInvalid: number;
    validPhones: number;
    validEmails: number;
    withFacebookLeadId: number;
  };
  byFanpage: AudienceFanpageBreakdown[];
}

const EMAIL_ATTR_KEYS = ["email", "mail", "e-mail", "e_mail", "dia_chi_email", "email_address"];
const EMAIL_REGEX = /^[a-z0-9._%+-]+@[a-z0-9.-]+\.[a-z]{2,}$/i;

/**
 * Chuẩn hóa số điện thoại khách hàng sang 3 định dạng quảng cáo:
 * - `local`: `0912345678`
 * - `digitsIntl`: `84912345678` (dùng cho SHA-256 của Facebook Custom Audience)
 * - `e164`: `+84912345678` (dùng cho Google Ads Customer Match & TikTok Ads)
 */
export function normalizeAudiencePhone(raw: string | null | undefined): NormalizedAudiencePhone | null {
  if (!raw) return null;
  const digits = raw.replace(/\D/g, "");
  if (!digits) return null;

  let nationalNine: string | null = null;

  if (/^840[35789]\d{8}$/.test(digits)) {
    // 840912345678 (12 digits) -> 912345678
    nationalNine = digits.slice(3);
  } else if (/^84[35789]\d{8}$/.test(digits)) {
    // 84912345678 (11 digits) -> 912345678
    nationalNine = digits.slice(2);
  } else if (/^0[35789]\d{8}$/.test(digits)) {
    // 0912345678 (10 digits) -> 912345678
    nationalNine = digits.slice(1);
  } else if (/^[35789]\d{8}$/.test(digits)) {
    // 912345678 (9 digits thiếu số 0 đầu)
    nationalNine = digits;
  }

  if (nationalNine) {
    return {
      local: `0${nationalNine}`,
      digitsIntl: `84${nationalNine}`,
      e164: `+84${nationalNine}`,
    };
  }

  // Hỗ trợ số bàn / hotline Việt Nam (024..., 028... - 10 hoặc 11 số)
  if (/^02\d{8,9}$/.test(digits)) {
    const withoutZero = digits.slice(1);
    return {
      local: digits,
      digitsIntl: `84${withoutZero}`,
      e164: `+84${withoutZero}`,
    };
  }
  if (/^842\d{8,9}$/.test(digits)) {
    const without84 = digits.slice(2);
    return {
      local: `0${without84}`,
      digitsIntl: digits,
      e164: `+${digits}`,
    };
  }

  // Số quốc tế hợp lệ khác (từ 10 đến 15 chữ số)
  if (digits.length >= 10 && digits.length <= 15) {
    const intl = digits.startsWith("0") ? `84${digits.slice(1)}` : digits;
    return {
      local: digits,
      digitsIntl: intl,
      e164: `+${intl}`,
    };
  }

  return null;
}

/** Trích xuất và chuẩn hóa email hợp lệ từ `lead.attrs`. */
export function extractAudienceEmail(attrs: Record<string, string> | null | undefined): string | null {
  if (!attrs) return null;
  for (const [rawKey, rawVal] of Object.entries(attrs)) {
    const key = rawKey.trim().toLowerCase();
    if (!EMAIL_ATTR_KEYS.includes(key) && !key.includes("email")) continue;
    const candidate = (rawVal ?? "").trim().toLowerCase();
    if (EMAIL_REGEX.test(candidate)) {
      return candidate;
    }
  }
  return null;
}

/** Tách Họ (`lastName`) và Tên (`firstName`) từ họ tên đầy đủ tiếng Việt. */
export function splitAudienceName(rawName: string | null | undefined): {
  fullName: string | null;
  firstName: string | null;
  lastName: string | null;
} {
  const cleaned = (rawName ?? "").replace(/\s+/g, " ").trim();
  if (!cleaned) {
    return { fullName: null, firstName: null, lastName: null };
  }
  const parts = cleaned.split(" ");
  if (parts.length === 1) {
    return { fullName: cleaned, firstName: parts[0]!, lastName: null };
  }
  const lastName = parts[0]!;
  const firstName = parts.slice(1).join(" ");
  return { fullName: cleaned, firstName, lastName };
}

/** Băm SHA-256 theo đúng chuẩn Meta / Google / TikTok (trim + lowercase UTF-8). */
export function sha256Hex(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toLowerCase();
  if (!normalized) return "";
  return createHash("sha256").update(normalized, "utf8").digest("hex");
}

const CATEGORY_PRIORITY: Record<LeadCategory, number> = {
  KHD: 6,
  GDTD: 5,
  KHQT: 4,
  CHUA_LH_DUOC: 3,
  CHUA_PHAN_LOAI: 2,
  FAIL: 1,
};

/**
 * Khử trùng lặp danh sách Lead (khi gộp nhiều Fanpage hoặc khách để lại thông tin nhiều lần)
 * và chuẩn hóa từng liên hệ để sẵn sàng đẩy lên Facebook / Google / TikTok / Zalo.
 */
export function deduplicateAudienceContacts(leads: RawAudienceLead[]): AudienceBuildResult {
  const byKey = new Map<string, AudienceContact>();
  const pageRawCounts = new Map<string, { name: string; raw: number; uniqueKeys: Set<string> }>();

  let duplicatesRemoved = 0;
  let skippedInvalid = 0;

  for (const lead of leads) {
    const phone = normalizeAudiencePhone(lead.phone);
    const email = extractAudienceEmail(lead.attrs);

    const pageId = lead.facebookPageId?.trim() || "__NO_PAGE__";
    const pageName =
      lead.facebookPageName?.trim() ||
      (lead.facebookPageId?.trim() ? `Page ${lead.facebookPageId.trim()}` : "Nguồn khác / Không gắn Fanpage");

    const pageEntry = pageRawCounts.get(pageId) ?? {
      name: pageName,
      raw: 0,
      uniqueKeys: new Set<string>(),
    };
    pageEntry.raw += 1;
    if (lead.facebookPageName?.trim()) {
      pageEntry.name = lead.facebookPageName.trim();
    }
    pageRawCounts.set(pageId, pageEntry);

    if (!phone && !email) {
      skippedInvalid += 1;
      continue;
    }

    const key = phone ? `phone:${phone.local}` : `email:${email}`;
    pageEntry.uniqueKeys.add(key);

    const nameParts = splitAudienceName(lead.name);
    const createdAtIso =
      lead.createdAt instanceof Date ? lead.createdAt.toISOString() : new Date(lead.createdAt).toISOString();

    const existing = byKey.get(key);
    if (!existing) {
      byKey.set(key, {
        key,
        leadId: lead.id,
        fullName: nameParts.fullName,
        firstName: nameParts.firstName,
        lastName: nameParts.lastName,
        phoneLocal: phone?.local ?? null,
        phoneDigitsIntl: phone?.digitsIntl ?? null,
        phoneE164: phone?.e164 ?? null,
        phoneSha256: phone ? sha256Hex(phone.digitsIntl) : null,
        email,
        emailSha256: email ? sha256Hex(email) : null,
        category: lead.category,
        source: lead.source,
        facebookPageId: lead.facebookPageId ?? null,
        facebookPageName: lead.facebookPageName ?? null,
        facebookLeadId: lead.facebookLeadId ?? null,
        createdAt: createdAtIso,
      });
      continue;
    }

    duplicatesRemoved += 1;

    // Gộp thông tin phong phú nhất từ các bản ghi trùng SĐT
    if (!existing.fullName && nameParts.fullName) {
      existing.fullName = nameParts.fullName;
      existing.firstName = nameParts.firstName;
      existing.lastName = nameParts.lastName;
    }
    if (!existing.email && email) {
      existing.email = email;
      existing.emailSha256 = sha256Hex(email);
    }
    if (!existing.facebookLeadId && lead.facebookLeadId) {
      existing.facebookLeadId = lead.facebookLeadId;
    }
    if (!existing.facebookPageId && lead.facebookPageId) {
      existing.facebookPageId = lead.facebookPageId;
      existing.facebookPageName = lead.facebookPageName ?? null;
    }
    if (CATEGORY_PRIORITY[lead.category] > CATEGORY_PRIORITY[existing.category]) {
      existing.category = lead.category;
    }
  }

  const contacts = [...byKey.values()];
  let validPhones = 0;
  let validEmails = 0;
  let withFacebookLeadId = 0;

  for (const c of contacts) {
    if (c.phoneDigitsIntl) validPhones += 1;
    if (c.email) validEmails += 1;
    if (c.facebookLeadId) withFacebookLeadId += 1;
  }

  const byFanpage: AudienceFanpageBreakdown[] = [...pageRawCounts.entries()]
    .map(([facebookPageId, info]) => ({
      facebookPageId,
      facebookPageName: info.name,
      rawLeadCount: info.raw,
      uniqueContactCount: info.uniqueKeys.size,
    }))
    .sort((a, b) => b.uniqueContactCount - a.uniqueContactCount);

  return {
    contacts,
    stats: {
      totalMatchedLeads: leads.length,
      uniqueContacts: contacts.length,
      duplicatesRemoved,
      skippedInvalid,
      validPhones,
      validEmails,
      withFacebookLeadId,
    },
    byFanpage,
  };
}

export interface MetaCustomAudiencePayload {
  schema: ["PHONE", "EMAIL", "FN", "LN", "COUNTRY"];
  data: Array<[string, string, string, string, string]>;
}

const VN_COUNTRY_HASH = sha256Hex("vn");

/**
 * Sinh payload chuẩn Meta Marketing API `POST /{audience_id}/users`.
 * Tất cả các trường đều được băm SHA-256 theo quy chuẩn của Meta.
 */
export function buildMetaCustomAudiencePayload(contacts: AudienceContact[]): MetaCustomAudiencePayload {
  const data: Array<[string, string, string, string, string]> = [];

  for (const contact of contacts) {
    const phoneHash = contact.phoneSha256 ?? "";
    const emailHash = contact.emailSha256 ?? "";
    if (!phoneHash && !emailHash) continue;

    const fnHash = contact.firstName ? sha256Hex(contact.firstName) : "";
    const lnHash = contact.lastName ? sha256Hex(contact.lastName) : "";

    data.push([phoneHash, emailHash, fnHash, lnHash, VN_COUNTRY_HASH]);
  }

  return {
    schema: ["PHONE", "EMAIL", "FN", "LN", "COUNTRY"],
    data,
  };
}

/** Chia danh sách khách hàng thành các batch (mặc định tối đa 10,000 dòng/batch của Meta). */
export function chunkMetaAudiencePayload(
  contacts: AudienceContact[],
  batchSize = 10_000,
): MetaCustomAudiencePayload[] {
  const full = buildMetaCustomAudiencePayload(contacts);
  if (full.data.length === 0) return [];

  const chunks: MetaCustomAudiencePayload[] = [];
  for (let i = 0; i < full.data.length; i += batchSize) {
    chunks.push({
      schema: full.schema,
      data: full.data.slice(i, i + batchSize),
    });
  }
  return chunks;
}

/** Chống CSV Formula Injection nhưng giữ nguyên SĐT bắt đầu bằng `+84`. */
function escapeCsvCell(value: string | null | undefined, allowLeadingPlusPhone = false): string {
  const raw = (value ?? "").trim();
  if (!raw) return "";

  let safe = raw;
  if (/^[=@-]/.test(safe) || (safe.startsWith("+") && !(allowLeadingPlusPhone && /^\+\d+$/.test(safe)))) {
    safe = `'${safe}`;
  }

  if (/[",\r\n]/.test(safe)) {
    return `"${safe.replace(/"/g, '""')}"`;
  }
  return safe;
}

/**
 * Sinh nội dung file xuất tệp khách hàng theo đúng định dạng yêu cầu của từng nền tảng quảng cáo:
 * - `meta_csv`: Facebook Custom Audience CSV (`phone,email,fn,ln,country`)
 * - `google_csv`: Google Ads Customer Match CSV (`Email,Phone,First Name,Last Name,Country,Zip`)
 * - `tiktok_csv`: TikTok Ads Custom Audience CSV (`phone,email,phone_sha256,email_sha256`)
 * - `zalo_txt`: Zalo Ads Phone List `.txt` (Mỗi dòng 1 SĐT chuẩn hóa)
 */
export function formatAudienceExport(
  contacts: AudienceContact[],
  format: AudienceExportFormat,
): { content: string; mimeType: string; extension: "csv" | "txt" } {
  if (format === "zalo_txt") {
    const phones = contacts
      .map((c) => c.phoneLocal)
      .filter((p): p is string => Boolean(p));
    return {
      content: phones.join("\r\n"),
      mimeType: "text/plain; charset=utf-8",
      extension: "txt",
    };
  }

  if (format === "google_csv") {
    const lines = ["Email,Phone,First Name,Last Name,Country,Zip"];
    for (const c of contacts) {
      lines.push(
        [
          escapeCsvCell(c.email),
          escapeCsvCell(c.phoneE164, true),
          escapeCsvCell(c.firstName),
          escapeCsvCell(c.lastName),
          "VN",
          "",
        ].join(","),
      );
    }
    return {
      content: `\uFEFF${lines.join("\r\n")}`,
      mimeType: "text/csv; charset=utf-8",
      extension: "csv",
    };
  }

  if (format === "tiktok_csv") {
    const lines = ["phone,email,phone_sha256,email_sha256"];
    for (const c of contacts) {
      lines.push(
        [
          escapeCsvCell(c.phoneE164, true),
          escapeCsvCell(c.email),
          escapeCsvCell(c.phoneSha256),
          escapeCsvCell(c.emailSha256),
        ].join(","),
      );
    }
    return {
      content: `\uFEFF${lines.join("\r\n")}`,
      mimeType: "text/csv; charset=utf-8",
      extension: "csv",
    };
  }

  // Default: meta_csv (Facebook Custom Audience Template)
  const lines = ["phone,email,fn,ln,country"];
  for (const c of contacts) {
    lines.push(
      [
        escapeCsvCell(c.phoneDigitsIntl),
        escapeCsvCell(c.email),
        escapeCsvCell(c.firstName),
        escapeCsvCell(c.lastName),
        "VN",
      ].join(","),
    );
  }
  return {
    content: `\uFEFF${lines.join("\r\n")}`,
    mimeType: "text/csv; charset=utf-8",
    extension: "csv",
  };
}

export const CRM_AUDIENCE_PREFIX = "CRM- ";

/** Loại bỏ tiền tố `CRM-` ở đầu chuỗi để lấy tên gốc. */
export function stripCrmPrefix(rawName: string | null | undefined): string {
  const trimmed = (rawName ?? "").trim();
  if (!trimmed) return "";
  return trimmed.replace(/^(?:crm\s*[-–—:]\s*)+/i, "").trim();
}

/**
 * Đảm bảo mọi tên tệp khách hàng / Lookalike / Saved Audience tạo từ hệ thống
 * luôn bắt đầu bằng tiền tố chuẩn `CRM- ` để phân biệt rõ và không bao giờ đè lên tệp cũ.
 */
export function ensureCrmPrefix(rawName: string | null | undefined): string {
  const core = stripCrmPrefix(rawName);
  if (!core) return `${CRM_AUDIENCE_PREFIX}Tệp khách hàng`;
  return `${CRM_AUDIENCE_PREFIX}${core}`;
}

export type LookalikeTierKey =
  | "0_1"
  | "0_2"
  | "0_3"
  | "1_3"
  | "3_5"
  | "5_7"
  | "7_10";

export interface LookalikeTierOption {
  key: LookalikeTierKey;
  label: string;
  shortLabel: string;
  desc: string;
  startRatio: number;
  endRatio: number;
}

export const LOOKALIKE_TIER_OPTIONS: LookalikeTierOption[] = [
  {
    key: "0_1",
    label: "LAL 1% (0% – 1%)",
    shortLabel: "1%",
    desc: "Sát nhất với tệp gốc — Tỷ lệ chuyển đổi cao nhất",
    startRatio: 0,
    endRatio: 0.01,
  },
  {
    key: "0_2",
    label: "LAL 2% (0% – 2%)",
    shortLabel: "2%",
    desc: "Mở rộng nhẹ, cân bằng giữa độ nét và quy mô",
    startRatio: 0,
    endRatio: 0.02,
  },
  {
    key: "0_3",
    label: "LAL 3% (0% – 3%)",
    shortLabel: "3%",
    desc: "Chuẩn chạy tỉnh (Đủ rộng khi kẹp thêm vị trí Tỉnh/Thành)",
    startRatio: 0,
    endRatio: 0.03,
  },
  {
    key: "1_3",
    label: "LAL 1% – 3%",
    shortLabel: "1% to 3%",
    desc: "Tách riêng lớp 1%–3% để chạy nhóm quảng cáo mở rộng",
    startRatio: 0.01,
    endRatio: 0.03,
  },
  {
    key: "3_5",
    label: "LAL 3% – 5%",
    shortLabel: "3% to 5%",
    desc: "Bậc thang mở rộng trung bình (3% đến 5%)",
    startRatio: 0.03,
    endRatio: 0.05,
  },
  {
    key: "5_7",
    label: "LAL 5% – 7%",
    shortLabel: "5% to 7%",
    desc: "Bậc thang mở rộng cao (5% đến 7%)",
    startRatio: 0.05,
    endRatio: 0.07,
  },
  {
    key: "7_10",
    label: "LAL 7% – 10%",
    shortLabel: "7% to 10%",
    desc: "Bậc thang phủ rộng tối đa (7% đến 10%)",
    startRatio: 0.07,
    endRatio: 0.1,
  },
];

export interface MetaLookalikeSpecPayload {
  type: "custom_ratio";
  country: string;
  starting_ratio?: number;
  ratio: number;
}

/** Sinh cấu trúc `lookalike_spec` đúng chuẩn Meta Marketing API. */
export function buildMetaLookalikeSpec(
  tierKey: LookalikeTierKey,
  country = "VN",
): MetaLookalikeSpecPayload {
  const tier =
    LOOKALIKE_TIER_OPTIONS.find((item) => item.key === tierKey) ??
    LOOKALIKE_TIER_OPTIONS[0]!;

  if (tier.startRatio > 0) {
    return {
      type: "custom_ratio",
      country,
      starting_ratio: tier.startRatio,
      ratio: tier.endRatio,
    };
  }

  return {
    type: "custom_ratio",
    country,
    ratio: tier.endRatio,
  };
}

/** Đặt tên chuẩn có tiền tố `CRM- LAL (VN, ...)` cho tệp Lookalike tạo mới. */
export function formatLookalikeAudienceName(
  baseName: string,
  tierKey: LookalikeTierKey,
  country = "VN",
): string {
  const tier =
    LOOKALIKE_TIER_OPTIONS.find((item) => item.key === tierKey) ??
    LOOKALIKE_TIER_OPTIONS[0]!;
  const core = stripCrmPrefix(baseName) || "Tệp khách hàng";
  return ensureCrmPrefix(`LAL (${country}, ${tier.shortLabel}) - ${core}`);
}

export interface VietnamMetaRegion {
  key: string;
  name: string;
  keywords: string[];
}

/**
 * Danh mục mã vùng địa lý (`adgeolocation` region key) chính thức của Meta tại Việt Nam.
 */
export const VIETNAM_META_REGIONS: VietnamMetaRegion[] = [
  { key: "3997", name: "Hà Nam", keywords: ["ha nam", "hà nam", "phủ lý", "phu ly"] },
  { key: "4148", name: "Bắc Giang", keywords: ["bac giang", "bắc giang"] },
  { key: "3993", name: "Hòa Bình", keywords: ["hoa binh", "hòa bình", "hoà bình"] },
  { key: "3961", name: "Bắc Ninh", keywords: ["bac ninh", "bắc ninh"] },
  { key: "3983", name: "Hà Nội", keywords: ["ha noi", "hà nội", "thủ đô"] },
  { key: "3992", name: "Hà Tĩnh", keywords: ["ha tinh", "hà tĩnh"] },
  { key: "3960", name: "Cao Bằng", keywords: ["cao bang", "cao bằng"] },
  { key: "4156", name: "Thái Nguyên", keywords: ["thai nguyen", "thái nguyên"] },
  { key: "3982", name: "Vĩnh Phúc", keywords: ["vinh phuc", "vĩnh phúc"] },
  { key: "4153", name: "Phú Thọ", keywords: ["phu tho", "phú thọ", "việt trì"] },
  { key: "4147", name: "Hưng Yên", keywords: ["hung yen", "hưng yên"] },
  { key: "4146", name: "Hải Dương", keywords: ["hai duong", "hải dương"] },
  { key: "4150", name: "Hải Phòng", keywords: ["hai phong", "hải phòng"] },
  { key: "3968", name: "Quảng Ninh", keywords: ["quang ninh", "quảng ninh", "hạ long"] },
  { key: "4149", name: "Nam Định", keywords: ["nam dinh", "nam định"] },
  { key: "3999", name: "Ninh Bình", keywords: ["ninh binh", "ninh bình"] },
  { key: "3972", name: "Thái Bình", keywords: ["thai binh", "thái bình"] },
  { key: "3971", name: "Thanh Hóa", keywords: ["thanh hoa", "thanh hóa", "thanh hoá"] },
  { key: "3998", name: "Nghệ An", keywords: ["nghe an", "nghệ an", "vinh"] },
  { key: "3974", name: "Lạng Sơn", keywords: ["lang son", "lạng sơn"] },
  { key: "4008", name: "Tuyên Quang", keywords: ["tuyen quang", "tuyên quang"] },
  { key: "4010", name: "Yên Bái", keywords: ["yen bai", "yên bái"] },
  { key: "3996", name: "Lào Cai", keywords: ["lao cai", "lào cai"] },
  { key: "3969", name: "Sơn La", keywords: ["son la", "sơn la"] },
  { key: "4152", name: "Điện Biên", keywords: ["dien bien", "điện biên"] },
  { key: "3990", name: "Hà Giang", keywords: ["ha giang", "hà giang"] },
  { key: "4151", name: "Bắc Kạn", keywords: ["bac kan", "bắc kạn", "bắc cạn"] },
  { key: "4002", name: "Quảng Bình", keywords: ["quang binh", "quảng bình"] },
  { key: "4004", name: "Quảng Trị", keywords: ["quang tri", "quảng trị"] },
  { key: "4006", name: "Thừa Thiên - Huế", keywords: ["hue", "huế", "thừa thiên"] },
  { key: "4155", name: "Đà Nẵng", keywords: ["da nang", "đà nẵng"] },
  { key: "3967", name: "Quảng Nam", keywords: ["quang nam", "quảng nam"] },
  { key: "4003", name: "Quảng Ngãi", keywords: ["quang ngai", "quảng ngãi"] },
  { key: "3994", name: "Khánh Hòa", keywords: ["khanh hoa", "khánh hòa", "nha trang"] },
  { key: "3976", name: "Đắk Lắk", keywords: ["dak lak", "đắk lắk", "buôn ma thuột"] },
  { key: "3965", name: "Lâm Đồng", keywords: ["lam dong", "lâm đồng", "đà lạt"] },
  { key: "3984", name: "TP. Hồ Chí Minh", keywords: ["ho chi minh", "hồ chí minh", "tphcm", "sài gòn"] },
  { key: "4159", name: "Bình Dương", keywords: ["binh duong", "bình dương"] },
  { key: "3977", name: "Đồng Nai", keywords: ["dong nai", "đồng nai", "biên hòa"] },
  { key: "3985", name: "Bà Rịa - Vũng Tàu", keywords: ["vung tau", "vũng tàu", "bà rịa"] },
  { key: "3988", name: "Cần Thơ", keywords: ["can tho", "cần thơ"] },
  { key: "3975", name: "An Giang", keywords: ["an giang"] },
  { key: "3979", name: "Kiên Giang", keywords: ["kien giang", "kiên giang", "rạch giá", "phú quốc"] },
];

function normalizeTextForMatch(raw: string): string {
  return raw
    .toLowerCase()
    .normalize("NFC")
    .replace(/[_.,/\\()-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Tự động nhận diện mã Tỉnh/Thành Meta (`regionKeys`) từ tên Fanpage hoặc tên Chiến dịch
 * (VD: "Peugeot Hà Nam" -> ["3997"], "KIA BẮC GIANG" -> ["4148"], "Mazda Hòa Bình" -> ["3993"]).
 */
export function detectVietnamRegionsFromText(
  texts: Array<string | null | undefined>,
): string[] {
  const matched = new Set<string>();
  for (const raw of texts) {
    if (!raw) continue;
    const norm = normalizeTextForMatch(raw);
    const ascii = norm.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d");
    for (const region of VIETNAM_META_REGIONS) {
      for (const kw of region.keywords) {
        if (norm.includes(kw) || ascii.includes(kw)) {
          matched.add(region.key);
          break;
        }
      }
    }
  }
  return [...matched];
}

export function getVietnamRegionNames(keys: string[]): string[] {
  const byKey = new Map(VIETNAM_META_REGIONS.map((r) => [r.key, r.name]));
  return keys.map((k) => byKey.get(k) ?? `Vùng ${k}`);
}

