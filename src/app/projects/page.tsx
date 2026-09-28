import { redirect } from "next/navigation";

import { ProjectsList } from "@/components/projects/projects-list";
import { canManageProjects, canViewProjects } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProjectsWithStatsForViewer, toProjectViewer } from "@/lib/db/project-repo";

export const metadata = { title: "Dự án — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function ProjectsPage() {
  const viewer = await getViewer();
  if (!viewer || !canViewProjects(viewer.role)) redirect("/leads");

  const projects =
    isDatabaseConfigured() && viewer
      ? await listProjectsWithStatsForViewer(toProjectViewer(viewer)).catch(() => [])
      : [];

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">Dự án</h1>
        <p className="text-[13px] text-muted-foreground">
          Quản lý không gian làm việc, catalog và field phụ theo từng project.
        </p>
      </div>
      <ProjectsList projects={projects} canCreate={canManageProjects(viewer.role)} />
    </div>
  );
}
