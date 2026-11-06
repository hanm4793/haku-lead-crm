import { redirect } from "next/navigation";
import Link from "next/link";
import { KeyRound } from "lucide-react";

import { AccountProfileForm } from "@/components/account/account-profile-form";
import { PushNotificationCard } from "@/components/pwa/push-notification-manager";
import { PwaInstallMenuRow } from "@/components/pwa/pwa-install-prompt";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getViewer } from "@/lib/auth/viewer";
import { canUsePushNotifications, ROLE_LABELS } from "@/lib/auth/roles";

export const metadata = { title: "Tài khoản — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Faccount");

  const showPushSettings = canUsePushNotifications(viewer);

  return (
    <div className="mx-auto max-w-2xl space-y-4 p-3 sm:space-y-5 sm:p-5">
      <div className="max-md:hidden">
        <h1 className="text-xl font-bold tracking-tight">Tài khoản</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Cập nhật hồ sơ hiển thị và cài đặt thông báo trên SEMTOP Marketing CRM.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card empty:hidden">
        <PwaInstallMenuRow />
      </div>

      {showPushSettings && <PushNotificationCard />}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Hồ sơ</CardTitle>
          <CardDescription>Họ tên dùng trên sidebar và nhật ký hoạt động.</CardDescription>
        </CardHeader>
        <CardContent>
          <AccountProfileForm
            fullName={viewer.fullName}
            email={viewer.email}
            roleLabel={viewer.isDemo ? "Demo" : ROLE_LABELS[viewer.role]}
            canEdit={!viewer.isDemo}
          />
        </CardContent>
      </Card>

      {!viewer.isDemo && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Bảo mật</CardTitle>
            <CardDescription>Cập nhật mật khẩu đăng nhập.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button asChild variant="outline" className="gap-2">
              <Link href="/account/password">
                <KeyRound className="size-4" />
                Đổi mật khẩu
              </Link>
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
