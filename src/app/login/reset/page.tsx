import { Suspense } from "react";

import { ResetPasswordForm } from "@/components/auth/reset-password-form";

export const metadata = { title: "Đặt mật khẩu · CRM Lead" };

export default function ResetPasswordPage() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-[#f4f6fa] p-4">
      <Suspense fallback={<div className="text-sm text-muted-foreground">Đang tải…</div>}>
        <ResetPasswordForm />
      </Suspense>
    </div>
  );
}
