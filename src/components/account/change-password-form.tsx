"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";

export function ChangePasswordForm() {
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setInfo(null);
    if (password.length < 6) {
      setError("Mật khẩu tối thiểu 6 ký tự.");
      return;
    }
    if (password !== confirm) {
      setError("Mật khẩu nhập lại không khớp.");
      return;
    }
    setPending(true);
    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(updateError.message);
        return;
      }
      setInfo("Đã đổi mật khẩu.");
      setPassword("");
      setConfirm("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Không đổi được mật khẩu.");
    } finally {
      setPending(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Đổi mật khẩu</CardTitle>
        <CardDescription>Mật khẩu mới có hiệu lực từ lần đăng nhập sau.</CardDescription>
      </CardHeader>
      <CardContent>
        <form className="space-y-3" onSubmit={submit}>
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Nhập lại mật khẩu</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirm}
              onChange={(e) => setConfirm(e.target.value)}
              required
            />
          </div>
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
          {info && <p className="text-[12px] text-emerald-700">{info}</p>}
          <div className="flex items-center gap-2 pt-1">
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Lưu mật khẩu"}
            </Button>
            <Button type="button" variant="ghost" asChild>
              <Link href="/account">Quay lại</Link>
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
