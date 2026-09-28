import { Suspense } from "react";
import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Đăng nhập — SEMTOP Marketing CRM" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-sidebar px-10 py-10 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(26,77,184,0.55),transparent_55%)]" />
        <div className="relative">
          <Image
            src="/brand/logo-white.png"
            alt="SEMTOP"
            width={160}
            height={40}
            className="h-10 w-auto object-contain"
            priority
          />
          <h1 className="mt-10 text-3xl font-bold tracking-tight">SEMTOP Marketing CRM</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            Quản lý lead đa kênh, Insights Meta Ads và vận hành sale trên một nền tảng.
          </p>
        </div>
        <p className="relative text-xs text-white/50">Cầu nối cho sự phát triển</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-3 lg:hidden">
            <div className="rounded-xl bg-sidebar px-4 py-3">
              <Image
                src="/brand/logo-white.png"
                alt="SEMTOP"
                width={140}
                height={36}
                className="h-9 w-auto object-contain"
                priority
              />
            </div>
            <p className="text-sm font-semibold text-foreground">SEMTOP Marketing CRM</p>
          </div>
          <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải…</div>}>
            <LoginForm configured={isSupabaseConfigured()} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
