"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronsUpDown } from "lucide-react";

import { setActiveProjectAction } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { UserRole } from "@/lib/auth/roles";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";
import { useLeadStore } from "@/store/lead-store";

interface ProjectContextValue {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  role: UserRole;
}

const ProjectContext = React.createContext<ProjectContextValue>({
  projects: [],
  activeProjectId: null,
  role: "SUPER_ADMIN",
});

export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectContextValue;
  children: React.ReactNode;
}) {
  return (
    <ProjectContext.Provider value={value}>{children}</ProjectContext.Provider>
  );
}

export function useProjectContext() {
  return React.useContext(ProjectContext);
}

export function ProjectSwitcher({
  projects: propProjects,
  activeProjectId: propActiveProjectId,
  className,
  hideWhenSingle,
}: {
  projects?: ProjectInfo[];
  activeProjectId?: string | null;
  className?: string;
  /** Staff: ẩn khi chỉ 1 project; super/partner vẫn hiện. */
  hideWhenSingle?: boolean;
}) {
  const ctx = useProjectContext();
  const projects = propProjects ?? ctx.projects;
  const activeProjectId =
    propActiveProjectId !== undefined ? propActiveProjectId : ctx.activeProjectId;
  const shouldHideSingle =
    hideWhenSingle !== undefined ? hideWhenSingle : ctx.role === "STAFF";

  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const active =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  if (shouldHideSingle && projects.length <= 1) return null;
  if (projects.length === 0) return null;

  const switchTo = async (projectId: string) => {
    if (projectId === active?.id || pending) return;
    setPending(true);
    try {
      const result = await setActiveProjectAction(projectId);
      if (result.ok) {
        useLeadStore.getState().resetFilters();
        router.refresh();
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn(
            "h-8 max-w-[220px] justify-between gap-1.5 px-2.5 text-[13px] font-medium",
            className,
          )}
          disabled={pending}
          title="Chọn dự án làm việc"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            <Briefcase className="size-3.5 shrink-0 text-primary" />
            <span className="truncate">{active?.name ?? "Chọn dự án"}</span>
          </span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-[220px]">
        {projects.map((project) => {
          const isCurrent = project.id === active?.id;
          return (
            <DropdownMenuItem
              key={project.id}
              onClick={() => void switchTo(project.id)}
              className={cn(
                "flex items-center justify-between gap-2 text-xs",
                isCurrent && "bg-accent font-semibold text-primary",
              )}
            >
              <span className="truncate">{project.name}</span>
              {isCurrent && <Check className="size-3.5 shrink-0 text-primary" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
