"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RESET_LINK_EXPIRED, readResetLink } from "@/lib/auth/reset-link";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ResetPasswordForm() {
  const router = useRouter();
  const [ready, setReady] = React.useState(false);
  const [checking, setChecking] = React.useState(true);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let active = true;

    const { data: subscription } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if (event === "PASSWORD_RECOVERY" || (event === "SIGNED_IN" && session)) {
        setError(null);
        setReady(true);
        setChecking(false);
      }
    });

    const finish = (ok: boolean, message?: string) => {
      if (!active) return;
      if (ok) {
        window.history.replaceState(null, "", window.location.pathname);
        setError(null);
        setReady(true);
      } else {
        setError(message ?? RESET_LINK_EXPIRED);
      }
      setChecking(false);
    };

    const boot = async () => {
      try {
        const link = readResetLink(window.location.href);
        if (link.kind === "error") {
          finish(false, link.message);
          return;
        }
        if (link.kind === "code") {
          const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(link.code);
          finish(!exchangeError);
          return;
        }
        if (link.kind === "tokens") {
          const { error: sessionError } = await supabase.auth.setSession({
            access_token: link.accessToken,
            refresh_token: link.refreshToken,
          });
          finish(!sessionError);
          return;
        }
        const { data } = await supabase.auth.getSession();
        finish(Boolean(data.session));
      } catch {
        finish(false);
      }
    };

    void boot();
    return () => {
      active = false;
      subscription.subscription.unsubscribe();
    };
  }, []);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }

    setPending(true);
    const supabase = createSupabaseBrowserClient();
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setPending(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    router.replace("/leads");
    router.refresh();
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>Đặt mật khẩu</CardTitle>
        <CardDescription>Chọn mật khẩu mới cho tài khoản của bạn.</CardDescription>
      </CardHeader>
      <CardContent>
        {checking ? (
          <p className="flex items-center gap-2 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang kiểm tra link…
          </p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu mới</Label>
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={!ready}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="confirm">Nhập lại mật khẩu</Label>
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                required
                minLength={6}
                value={confirm}
                onChange={(event) => setConfirm(event.target.value)}
                disabled={!ready}
              />
            </div>
            {error && <p className="text-[12px] text-rose-600">{error}</p>}
            <Button type="submit" className="w-full" disabled={!ready || pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Lưu mật khẩu"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
