import { Suspense } from "react";
import Image from "next/image";

import { LoginForm } from "@/components/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Đăng nhập — SEMTOP Marketing CRM" };

export default function LoginPage() {
  return (
    <div className="flex min-h-dvh">
      <div className="relative hidden w-[42%] flex-col justify-between overflow-hidden bg-sidebar px-10 py-10 text-white lg:flex">
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top_right,rgba(26,77,184,0.55),transparent_55%)]" />
        <div className="relative">
          <div className="inline-flex rounded-xl bg-white px-3 py-2 shadow-sm ring-1 ring-black/5">
            <Image
              src="/brand/logo-white.png"
              alt="SEMTOP"
              width={160}
              height={40}
              className="h-10 w-auto object-contain"
              priority
            />
          </div>
          <h1 className="mt-10 text-3xl font-bold tracking-tight">SEMTOP Marketing CRM</h1>
          <p className="mt-3 max-w-sm text-sm leading-relaxed text-white/75">
            Quản lý lead đa kênh, Insights Meta Ads và vận hành sale trên một nền tảng.
          </p>
        </div>
        <p className="relative text-xs text-white/50">Cầu nối cho sự phát triển</p>
      </div>

      <div className="flex flex-1 items-center justify-center bg-background px-5 pt-[max(1.5rem,env(safe-area-inset-top))] pb-[max(1.5rem,env(safe-area-inset-bottom))] sm:p-6">
        <div className="w-full max-w-md space-y-6">
          <div className="flex flex-col items-center gap-2.5 lg:hidden">
            <div className="rounded-2xl bg-white px-4 py-3 shadow-xs ring-1 ring-black/5">
              <Image
                src="/brand/logo-white.png"
                alt="SEMTOP"
                width={140}
                height={36}
                className="h-9 w-auto object-contain"
                priority
              />
            </div>
            <div className="text-center">
              <p className="text-base font-bold text-foreground">SEMTOP Marketing CRM</p>
              <p className="mt-0.5 text-xs text-muted-foreground">Đăng nhập để tiếp tục quản lý khách hàng</p>
            </div>
          </div>
          <Suspense fallback={<div className="text-center text-sm text-muted-foreground">Đang tải…</div>}>
            <LoginForm configured={isSupabaseConfigured()} />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
