"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2, LogIn, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { useToast } from "@/components/providers/toast-provider";

/**
 * Tạm khóa đăng ký công khai trên giao diện đăng nhập.
 * Khi cần mở lại đăng ký tự do, đổi hằng số này thành `true` (và đặt `ENABLE_PUBLIC_SIGNUP=true` ở server).
 */
const ENABLE_PUBLIC_SIGNUP = false;

export function LoginForm({ configured }: { configured: boolean }) {
  const toast = useToast();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [mode, setMode] = React.useState<"signin" | "signup" | "forgot">("signin");
  const [email, setEmail] = React.useState("");
  const [password, setPassword] = React.useState("");
  const [fullName, setFullName] = React.useState("");
  const [pending, setPending] = React.useState(false);

  const goNext = () => {
    const next = searchParams.get("next");
    const safeNext = next && next.startsWith("/") && !next.startsWith("//") ? next : "/leads";
    router.replace(safeNext);
    router.refresh();
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setPending(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (mode === "forgot") {
        const redirectTo = `${window.location.origin}/login/reset`;
        const { error: resetError } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });
        if (resetError) {
          toast.error(resetError.message);
          return;
        }
        toast.info("Đã gửi yêu cầu", "Nếu email này có tài khoản, bạn sẽ nhận được link đặt lại mật khẩu.");
        setMode("signin");
        return;
      }

      if (mode === "signup") {
        if (!ENABLE_PUBLIC_SIGNUP) {
          toast.error("Đăng ký công khai đã tắt. Vui lòng liên hệ quản trị viên để được cấp tài khoản.");
          setMode("signin");
          return;
        }
        const { data, error: signUpError } = await supabase.auth.signUp({
          email,
          password,
          options: { data: { full_name: fullName || undefined } },
        });
        if (signUpError) {
          toast.error(signUpError.message);
          return;
        }
        if (data.session) {
          goNext();
          return;
        }
        toast.success("Đã tạo tài khoản", "Nếu hệ thống yêu cầu xác nhận email, hãy mở hộp thư rồi đăng nhập lại.");
        setMode("signin");
        return;
      }

      const { error: signInError } = await supabase.auth.signInWithPassword({ email, password });
      if (signInError) {
        toast.error(
          signInError.message === "Invalid login credentials"
            ? "Email hoặc mật khẩu không đúng."
            : signInError.message,
        );
        return;
      }

      goNext();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Không đăng nhập được.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card className="w-full border-border/80 shadow-sm">
      <CardHeader className="space-y-1.5">
        <CardTitle className="text-xl tracking-tight">Đăng nhập</CardTitle>
        <CardDescription>
          {mode === "forgot"
            ? "Nhập email để nhận link đặt lại mật khẩu."
            : mode === "signin" || !ENABLE_PUBLIC_SIGNUP
              ? "Đăng nhập SEMTOP Marketing CRM."
              : "Tạo tài khoản mới (lần đầu)."}
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
            {ENABLE_PUBLIC_SIGNUP && mode === "signup" && (
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

            {mode !== "forgot" && (
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
            )}

            <Button type="submit" className="w-full gap-2" disabled={pending}>
              {pending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : mode === "signin" ? (
                <LogIn className="size-4" />
              ) : (
                <UserPlus className="size-4" />
              )}
              {mode === "signin" ? "Đăng nhập" : mode === "forgot" ? "Gửi link đặt lại" : "Tạo tài khoản"}
            </Button>

            {mode === "signin" && (
              <button
                type="button"
                className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setMode("forgot");
                }}
              >
                Quên mật khẩu?
              </button>
            )}

            {mode === "forgot" && (
              <button
                type="button"
                className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setMode("signin");
                }}
              >
                Đã có tài khoản? Đăng nhập
              </button>
            )}

            {ENABLE_PUBLIC_SIGNUP && mode !== "forgot" && (
              <button
                type="button"
                className="w-full text-center text-[12px] text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setMode((current) => (current === "signin" ? "signup" : "signin"));
                }}
              >
                {mode === "signin" ? "Chưa có tài khoản? Đăng ký" : "Đã có tài khoản? Đăng nhập"}
              </button>
            )}
          </form>
        )}
      </CardContent>
    </Card>
  );
}
