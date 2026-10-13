/** Chuẩn hóa SĐT để lưu: chuẩn hóa đầu số +84/84 của VN về 0..., bỏ ký tự thừa. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  if (/^840\d{9}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }
  if (/^84\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Khóa so sánh trùng: chỉ giữ chữ số, đầu số 840 (12 số) hoặc 84 (11 số) đổi thành 0. */
export function phoneKey(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (/^840\d{9}$/.test(digits)) {
    return `0${digits.slice(3)}`;
  }
  if (/^84\d{9}$/.test(digits)) {
    return `0${digits.slice(2)}`;
  }
  return digits;
}

/** Trả về lời báo lỗi, hoặc null nếu SĐT hợp lệ (9–15 chữ số). */
export function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "Số điện thoại không được để trống.";
  if (digits.length < 9 || digits.length > 15) return "Số điện thoại phải có từ 9 đến 15 chữ số.";
  return null;
}
