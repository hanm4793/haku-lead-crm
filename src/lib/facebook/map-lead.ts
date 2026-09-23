export type FacebookFieldDatum = { name: string; values: string[] };

export type MappedFacebookLead =
  | {
      ok: true;
      phone: string;
      name: string | null;
      campaign: string | null;
      adContent: string | null;
    }
  | { ok: false; reason: "missing_phone" };

const PHONE_KEYS = new Set(["phone_number", "phone", "mobile_phone"]);

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

export function mapFacebookLeadFields(
  fieldData: FacebookFieldDatum[],
  meta?: { campaignName?: string | null; adName?: string | null },
): MappedFacebookLead {
  const rawPhone = firstValue(fieldData, PHONE_KEYS);
  if (rawPhone == null) {
    return { ok: false, reason: "missing_phone" };
  }

  const phone = normalizePhone(rawPhone);
  if (phone == null) {
    return { ok: false, reason: "missing_phone" };
  }

  return {
    ok: true,
    phone,
    name: resolveName(fieldData),
    campaign: nonEmptyMeta(meta?.campaignName),
    adContent: nonEmptyMeta(meta?.adName),
  };
}
