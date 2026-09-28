import { redirect } from "next/navigation";

import { ChangePasswordForm } from "@/components/account/change-password-form";
import { getViewer } from "@/lib/auth/viewer";

export const metadata = { title: "Đổi mật khẩu — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function AccountPasswordPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Faccount%2Fpassword");
  if (viewer.isDemo) redirect("/account");

  return (
    <div className="mx-auto max-w-lg space-y-5 p-5">
      <div>
        <h1 className="text-xl font-bold tracking-tight">Đổi mật khẩu</h1>
        <p className="mt-1 text-sm text-muted-foreground">Cập nhật mật khẩu cho tài khoản đang đăng nhập.</p>
      </div>
      <ChangePasswordForm />
    </div>
  );
}
