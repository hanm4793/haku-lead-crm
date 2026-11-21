const VN_OLD_11_DIGIT_PREFIX_MAP: Record<string, string> = {
  "162": "032",
  "163": "033",
  "164": "034",
  "165": "035",
  "166": "036",
  "167": "037",
  "168": "038",
  "169": "039",
  "120": "070",
  "121": "079",
  "122": "077",
  "126": "076",
  "128": "078",
  "123": "083",
  "124": "084",
  "125": "085",
  "127": "081",
  "129": "082",
  "186": "056",
  "188": "058",
  "199": "059",
};

/** Bỏ tiền tố nhãn từ file xuất thô của Meta Ads / Excel (vd `p:+84903438685`, `tel:090...`). */
export function stripPhonePrefixLabel(raw: string): string {
  return raw
    .trim()
    .replace(/^(?:p|tel|phone|sđt|sdt)\s*:\s*/i, "")
    .trim();
}

function convertLegacyVn11Digit(digits: string): string | null {
  let rest = "";
  if (/^8401\d{9}$/.test(digits)) {
    rest = digits.slice(3);
  } else if (/^841\d{9}$/.test(digits)) {
    rest = digits.slice(2);
  } else if (/^01\d{9}$/.test(digits)) {
    rest = digits.slice(1);
  } else {
    return null;
  }
  const oldPrefix = rest.slice(0, 3);
  const mappedPrefix = VN_OLD_11_DIGIT_PREFIX_MAP[oldPrefix];
  if (!mappedPrefix) return null;
  return `${mappedPrefix}${rest.slice(3)}`;
}

/**
 * Chuẩn hóa SĐT đồng nhất trên toàn hệ thống (Import Excel, Tạo tay, Đồng bộ Facebook, Audience):
 * - Cắt tiền tố `p:`, `tel:`, `phone:` từ file xuất thô Meta.
 * - Đổi đầu 11 số cũ của VN (`016x`, `012x`, `0186/0188`, `0199` hoặc `+8416x`...) về 10 số mới.
 * - Chuẩn hóa đầu số `+84` / `84` / `840` của VN về `0...`.
 * - Tự bù số `0` đầu cho SĐT di động VN 9 chữ số bị mất số 0 đầu (`936884986` -> `0936884986`).
 * - Giữ nguyên `+<mã nước>...` với số quốc tế.
 */
export function normalizePhone(raw: string): string {
  const cleaned = stripPhonePrefixLabel(raw);
  const digits = cleaned.replace(/\D/g, "");
  if (!digits) return "";

  const convertedLegacy = convertLegacyVn11Digit(digits);
  if (convertedLegacy) return convertedLegacy;

  if (/^840\d{9,10}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }
  if (/^84(\d{9}|2\d{9})$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }
  if (
    !cleaned.startsWith("+") &&
    /^(?:3[2-9]|5[25689]|7[06-9]|8[1-9]|9\d)\d{7}$/.test(digits)
  ) {
    return `0${digits}`;
  }
  return cleaned.startsWith("+") ? `+${digits}` : digits;
}

/** Khóa so sánh trùng: chuẩn hóa qua normalizePhone rồi chỉ giữ chữ số. */
export function phoneKey(raw: string): string {
  return normalizePhone(raw).replace(/\D/g, "");
}

/** Trả về lời báo lỗi, hoặc null nếu SĐT hợp lệ (9–15 chữ số). */
export function validatePhone(raw: string): string | null {
  const digits = phoneKey(raw);
  if (digits.length === 0) return "Số điện thoại không được để trống.";
  if (digits.length < 9 || digits.length > 15) return "Số điện thoại phải có từ 9 đến 15 chữ số.";
  return null;
}
