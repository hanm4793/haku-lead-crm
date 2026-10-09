/** Chuẩn hóa SĐT để lưu: giữ dấu "+" đầu, bỏ mọi ký tự không phải số. */
export function normalizePhone(raw: string): string {
  const trimmed = raw.trim();
  const digits = trimmed.replace(/\D/g, "");
  if (!digits) return "";
  return trimmed.startsWith("+") ? `+${digits}` : digits;
}

/** Khóa so sánh trùng: chỉ giữ chữ số, đầu số 84 đổi thành 0 (+84901… ≡ 0901…). */
export function phoneKey(raw: string): string {
  return raw.replace(/\D/g, "").replace(/^84/, "0");
}

/** Trả về lời báo lỗi, hoặc null nếu SĐT hợp lệ (9–15 chữ số). */
export function validatePhone(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 0) return "Số điện thoại không được để trống.";
  if (digits.length < 9 || digits.length > 15) return "Số điện thoại phải có từ 9 đến 15 chữ số.";
  return null;
}
