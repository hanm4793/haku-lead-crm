import { redirect } from "next/navigation";

import { UsersAdmin } from "@/components/users/users-admin";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listManagedUsers, listShowroomOptions } from "@/lib/db/users-repo";

export const metadata = { title: "Tài khoản — CRM THACO Auto" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fusers");
  if (viewer.role !== "ADMIN") redirect("/leads");

  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-bold">Chưa cấu hình database</h1>
        <p className="text-[13px] text-muted-foreground">
          Cần <code className="rounded bg-secondary px-1">DATABASE_URL</code> để quản lý tài khoản.
        </p>
      </div>
    );
  }

  const [users, showrooms] = await Promise.all([listManagedUsers(), listShowroomOptions()]);

  return (
    <UsersAdmin initialUsers={users} showrooms={showrooms} currentUserId={viewer.appUserId ?? null} />
  );
}
