export type ResetLink =
  | { kind: "code"; code: string }
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

/** Đọc callback Supabase trên /login/reset. Mail mời gắn token ở hash, quên mật khẩu cùng trình duyệt gắn ?code=. */
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

  const code = query.get("code");
  if (code) return { kind: "code", code };

  const accessToken = hash.get("access_token");
  const refreshToken = hash.get("refresh_token");
  if (accessToken && refreshToken) {
    return { kind: "tokens", accessToken, refreshToken };
  }

  return { kind: "missing" };
}
