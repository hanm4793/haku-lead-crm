import { redirect } from "next/navigation";

import { UsersAdmin } from "@/components/users/users-admin";
import { canManageUsers } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { listProjects, toProjectInfo } from "@/lib/db/project-repo";
import { listManagedUsers } from "@/lib/db/users-repo";
import type { ProjectInfo } from "@/lib/types";

export const metadata = { title: "Người dùng — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getScopedViewer();
  if (!viewer) redirect("/login?next=%2Fusers");
  if (!canManageUsers(viewer.role)) redirect("/leads");
  const projectId = viewer.activeProjectId ?? undefined;

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

  let projects: ProjectInfo[] = [];
  if (viewer.role === "SUPER_ADMIN") {
    projects = (await listProjects().catch(() => [])).map(toProjectInfo);
  }
  const [users, facebookPages] = await Promise.all([
    listManagedUsers(viewer),
    listFacebookPages(projectId ? { projectId } : undefined),
  ]);
  const pages = facebookPages
    .filter((page) => page.active)
    .map((page) => ({
      value: page.facebookPageId,
      label: page.name?.trim() || page.facebookPageId,
    }));
  const partners = users
    .filter((user) => user.role === "PARTNER_ADMIN")
    .map((user) => ({ id: user.id, name: user.fullName }));

  return (
    <UsersAdmin
      initialUsers={users}
      pages={pages}
      partners={partners}
      projects={projects}
      actorRole={viewer.role}
      currentUserId={viewer.appUserId ?? null}
    />
  );
}
