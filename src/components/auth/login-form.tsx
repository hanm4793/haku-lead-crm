"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function LoginForm({ configured }: { configured: boolean }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = React.useState<"signin" | "signup">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const goNext = () => {
    const next = searchParams.get("next");
    router.replace(next && next.startsWith("/") ? next : "/leads");
    router.refresh();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);
    setError(null);
    setInfo(null);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "signup") {
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || undefined } },
        });
        if (signUpError) {
          setError(signUpError.message);
          return;
        }
        if (data.session) {
          goNext();
          return;
        }
        setInfo("Đã tạo tài khoản. Nếu Supabase yêu cầu xác nhận email, hãy mở hộp thư rồi đăng nhập lại.");
        setMode("signin");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        setError(
          signInError.message === "Invalid login credentials"
            ? "Email hoặc mật khẩu không đúng."
            : signInError.message,
        );
        return;
      }

      goNext();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đăng nhập được.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>CRM Lead</CardTitle>
        <CardDescription>
          {mode === "signin" ? "Đăng nhập để vào hệ thống quản lý lead." : "Tạo tài khoản mới (lần đầu)."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!configured ? (
          <p className="text-[13px] text-muted-foreground">
            Chưa cấu hình Supabase Auth nên hệ thống đang chạy chế độ demo với quyền admin — không cần đăng
            nhập. Điền <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_URL</code> và{" "}
            <code className="rounded bg-secondary px-1">NEXT_PUBLIC_SUPABASE_ANON_KEY</code> vào{" "}
            <code className="rounded bg-secondary px-1">.env.local</code> để bật đăng nhập thật.
          </p>
        ) : (
          <form className="space-y-3" onSubmit={submit}>
            {mode === "signup" && (
              <div className="space-y-1.5">
                <Label htmlFor="fullName">Họ tên</Label>
                <Input
                  id="fullName"
                  autoComplete="name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  placeholder="Nguyễn Văn A"
                />
              </div>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="password">Mật khẩu</Label>
              <Input
                id="password"
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                required
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>

            {error && <p className="text-[12px] text-rose-600">{error}</p>}
            {info && <p className="text-[12px] text-emerald-700">{info}</p>}

            <Button type="submit" className="w-full gap-2" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "signin" ? (
                <LogIn className="size-4" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {mode === "signin" ? "Đăng nhập" : "Tạo tài khoản"}
            </Button>

            <button
              type="button"
              className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline"
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError(null);
                setInfo(null);
              }}
            >
              {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
            </button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
