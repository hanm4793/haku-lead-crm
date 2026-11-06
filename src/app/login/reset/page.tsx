import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Đặt mật khẩu · CRM Lead" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-[#f4f6fa] px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
