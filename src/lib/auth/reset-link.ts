export type ResetOtpType = "invite" | "recovery" | "email";

export type ResetLink =
  | { kind: "code"; code: string }
  | { kind: "token_hash"; tokenHash: string; otpType: ResetOtpType }
  | { kind: "tokens"; accessToken: string; refreshToken: string }
  | { kind: "error"; message: string }
  | { kind: "missing" };

export const RESET_LINK_EXPIRED =
  "Link không còn hiệu lực hoặc đã được dùng. Hãy gửi lại email đặt mật khẩu.";

export function resetLinkMessage(errorCode: string | null, description: string | null) {
  if (
    errorCode === "otp_expired" ||
    /expired|invalid|already/i.test(description ?? "")
  ) {
    return RESET_LINK_EXPIRED;
  }
  if (description) return description;
  return RESET_LINK_EXPIRED;
}

function normalizeOtpType(raw: string | null): ResetOtpType {
  if (raw === "invite" || raw === "recovery" || raw === "email") return raw;
  return "recovery";
}

/** Đọc callback Supabase trên /login/reset. Hỗ trợ ?token_hash=, ?code=, và #access_token=. */
export function readResetLink(href: string): ResetLink {
  const url = new URL(href, "http://localhost");
  const query = url.searchParams;
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);

  const errorCode = query.get("error_code") ?? hash.get("error_code");
  const error = query.get("error") ?? hash.get("error");
  const description = query.get("error_description") ?? hash.get("error_description");
  if (error || errorCode || description) {
    return { kind: "error", message: resetLinkMessage(errorCode, description) };
  }

  const tokenHash = query.get("token_hash") ?? hash.get("token_hash");
  if (tokenHash) {
    const rawType = query.get("type") ?? hash.get("type");
    return { kind: "token_hash", tokenHash, otpType: normalizeOtpType(rawType) };
  }

  const code = query.get("code");
  if (code) return { kind: "code", code };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  return { kind: "missing" };
}
