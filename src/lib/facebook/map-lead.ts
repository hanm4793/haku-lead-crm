export type FacebookFieldDatum = { name: string; values: string[] };

export type MappedFacebookLead = {
  phone: string;
  name: string | null;
  campaign: string | null;
  adContent: string | null;
  /** Các field trong form không map vào cột CRM — giữ nguyên key/value để hiển thị ở chi tiết lead. */
  attrs: Record<string, string>;
};

const PHONE_KEYS = new Set(["phone_number", "phone", "mobile_phone"]);
const NAME_KEYS = new Set(["full_name", "first_name", "last_name"]);

/** Field Meta tự sinh, không có giá trị nghiệp vụ. */
const IGNORED_KEYS = new Set(["lead_id", "created_time", "platform", "is_organic"]);

const MAX_ATTR_KEYS = 30;
const MAX_ATTR_VALUE = 500;

function fieldKey(name: string): string {
  return name.trim().toLowerCase();
}

function firstValue(fieldData: FacebookFieldDatum[], keys: Set<string>): string | null {
  for (const field of fieldData) {
    if (!keys.has(fieldKey(field.name))) continue;
    const raw = field.values?.[0];
    if (raw == null) continue;
    const trimmed = raw.trim();
    if (trimmed.length > 0) return trimmed;
  }
  return null;
}

function normalizePhone(raw: string): string | null {
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;

  const hasPlus = trimmed.startsWith("+");
  const digits = trimmed.replace(/\D/g, "");
  if (digits.length === 0) return null;

  return hasPlus ? `+${digits}` : digits;
}

function resolveName(fieldData: FacebookFieldDatum[]): string | null {
  const full = firstValue(fieldData, new Set(["full_name"]));
  if (full) return full;

  const first = firstValue(fieldData, new Set(["first_name"]));
  const last = firstValue(fieldData, new Set(["last_name"]));
  if (first && last) return `${first} ${last}`.trim();
  if (first) return first;
  if (last) return last;
  return null;
}

function nonEmptyMeta(value: string | null | undefined): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

/**
 * Mọi field còn lại (email, thành phố, câu hỏi tùy chọn của form…) đi vào
 * `attrs`. Key giữ dạng lowercase như Meta trả; nhiều giá trị nối bằng ", ".
 */
function collectAttrs(fieldData: FacebookFieldDatum[]): Record<string, string> {
  const attrs: Record<string, string> = {};
  for (const field of fieldData) {
    const key = fieldKey(field.name);
    if (!key || PHONE_KEYS.has(key) || NAME_KEYS.has(key) || IGNORED_KEYS.has(key)) continue;
    if (key in attrs) continue;
    const value = (field.values ?? [])
      .map((v) => (v ?? "").trim())
      .filter((v) => v.length > 0)
      .join(", ");
    if (!value) continue;
    attrs[key] = value.length > MAX_ATTR_VALUE ? `${value.slice(0, MAX_ATTR_VALUE)}…` : value;
    if (Object.keys(attrs).length >= MAX_ATTR_KEYS) break;
  }
  return attrs;
}

/** Map Meta field_data → CRM fields. Thiếu SĐT vẫn import (phone = ""). */
export function mapFacebookLeadFields(
  fieldData: FacebookFieldDatum[],
  meta?: { campaignName?: string | null; adName?: string | null },
): MappedFacebookLead {
  const rawPhone = firstValue(fieldData, PHONE_KEYS);
  const phone = rawPhone ? normalizePhone(rawPhone) ?? "" : "";

  return {
    phone,
    name: resolveName(fieldData),
    campaign: nonEmptyMeta(meta?.campaignName),
    adContent: nonEmptyMeta(meta?.adName),
    attrs: collectAttrs(fieldData),
  };
}
