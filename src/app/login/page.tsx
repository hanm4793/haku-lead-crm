import { Suspense } from "react";

import { LoginForm } from "@/components/auth/login-form";
import { isSupabaseConfigured } from "@/lib/supabase/server";

export const metadata = { title: "Đăng nhập · CRM Lead" };

export default function LoginPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fa] p-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải…</div>}>
        <LoginForm configured={isSupabaseConfigured()} />
      </Suspense>
    </div>
  );
}
