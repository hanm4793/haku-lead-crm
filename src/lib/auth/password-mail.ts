import { createClient } from "@supabase/supabase-js";
import { headers } from "next/headers";
import { supabaseServiceRoleKey, supabaseUrl } from "@/lib/supabase/env";

export async function authRedirectOrigin() {
  const headerList = await headers();
  const origin = headerList.get("origin");
  if (origin) return origin;
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  const proto = headerList.get("x-forwarded-proto") ?? "http";
  if (host) return `${proto}://${host}`;
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

function adminAuthClient() {
  const url = supabaseUrl();
  const key = supabaseServiceRoleKey();
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Gửi thư mời đặt mật khẩu. Nếu email đã có trên Supabase thì gửi link đặt lại.
 */
export async function sendPasswordSetupEmail(
  email: string,
  fullName: string,
  origin: string,
): Promise<{ ok: true; sent: "invite" | "reset" } | { ok: false; error: string }> {
  const admin = adminAuthClient();
  if (!admin) {
    return {
      ok: false,
      error: "Chưa cấu hình SUPABASE_SERVICE_ROLE_KEY nên chưa gửi được email.",
    };
  }

  const redirectTo = `${origin}/login/reset`;
  const invited = await admin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data: { full_name: fullName },
  });
  if (!invited.error) return { ok: true, sent: "invite" };

  const alreadyRegistered = /already|registered|exists/i.test(invited.error.message);
  if (!alreadyRegistered) return { ok: false, error: invited.error.message };

  const reset = await admin.auth.resetPasswordForEmail(email, { redirectTo });
  if (reset.error) return { ok: false, error: reset.error.message };
  return { ok: true, sent: "reset" };
}
