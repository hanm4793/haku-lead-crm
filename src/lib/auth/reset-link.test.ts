import { describe, expect, it } from "vitest";

import { RESET_LINK_EXPIRED, readResetLink } from "./reset-link";

describe("readResetLink", () => {
  it("reads the invite tokens from the URL hash", () => {
    expect(
      readResetLink(
        "http://localhost:3000/login/reset#access_token=aaa&refresh_token=bbb&type=invite",
      ),
    ).toEqual({ kind: "tokens", accessToken: "aaa", refreshToken: "bbb" });
  });

  it("reads direct token_hash links from custom email templates", () => {
    expect(
      readResetLink(
        "https://crm.semtop.vn/login/reset?token_hash=th_123&type=invite",
      ),
    ).toEqual({ kind: "token_hash", tokenHash: "th_123", otpType: "invite" });
  });

  it("reads the same-browser recovery code", () => {
    expect(readResetLink("http://localhost:3000/login/reset?code=pkce-code")).toEqual({
      kind: "code",
      code: "pkce-code",
    });
  });

  it("maps an expired email link to a resend message", () => {
    expect(
      readResetLink(
        "http://localhost:3000/login/reset#error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired",
      ),
    ).toEqual({ kind: "error", message: RESET_LINK_EXPIRED });
  });

  it("reports a missing callback", () => {
    expect(readResetLink("http://localhost:3000/login/reset")).toEqual({ kind: "missing" });
  });
});
