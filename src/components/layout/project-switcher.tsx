"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Briefcase, Check, ChevronsUpDown, Loader2 } from "lucide-react";

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

interface ProjectContextInput {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  role: UserRole;
}

interface ProjectContextValue extends ProjectContextInput {
  isSwitchingProject: boolean;
  switchingToProject: ProjectInfo | null;
  switchProject: (projectId: string) => Promise<void>;
}

const ProjectContext = React.createContext<ProjectContextValue>({
  projects: [],
  activeProjectId: null,
  role: "SUPER_ADMIN",
  isSwitchingProject: false,
  switchingToProject: null,
  switchProject: async () => {},
});

export function ProjectProvider({
  value,
  children,
}: {
  value: ProjectContextInput;
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isTransitioning, startTransition] = React.useTransition();
  const [actionPending, setActionPending] = React.useState(false);
  const [targetProjectId, setTargetProjectId] = React.useState<string | null>(null);

  // Khi activeProjectId từ server đã khớp với project đích và transition xong → tắt trạng thái chờ
  React.useEffect(() => {
    if (targetProjectId && value.activeProjectId === targetProjectId && !isTransitioning && !actionPending) {
      setTargetProjectId(null);
    }
  }, [value.activeProjectId, targetProjectId, isTransitioning, actionPending]);

  const isSwitchingProject = actionPending || isTransitioning || Boolean(targetProjectId && value.activeProjectId !== targetProjectId);

  const switchingToProject = React.useMemo(
    () => (targetProjectId ? (value.projects.find((p) => p.id === targetProjectId) ?? null) : null),
    [targetProjectId, value.projects],
  );

  const switchProject = React.useCallback(
    async (projectId: string) => {
      const currentActive =
        value.projects.find((p) => p.id === value.activeProjectId) ?? value.projects[0] ?? null;
      if (projectId === currentActive?.id || actionPending || isTransitioning) return;

      setTargetProjectId(projectId);
      setActionPending(true);
      try {
        const result = await setActiveProjectAction(projectId);
        if (result.ok) {
          startTransition(() => {
            useLeadStore.getState().resetFilters();
            router.refresh();
          });
        } else {
          setTargetProjectId(null);
        }
      } catch {
        setTargetProjectId(null);
      } finally {
        setActionPending(false);
      }
    },
    [value.projects, value.activeProjectId, actionPending, isTransitioning, router],
  );

  const contextValue = React.useMemo<ProjectContextValue>(
    () => ({
      ...value,
      isSwitchingProject,
      switchingToProject,
      switchProject,
    }),
    [value, isSwitchingProject, switchingToProject, switchProject],
  );

  return (
    <ProjectContext.Provider value={contextValue}>{children}</ProjectContext.Provider>
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

  const active =
    ctx.switchingToProject ??
    projects.find((p) => p.id === activeProjectId) ??
    projects[0] ??
    null;

  if (shouldHideSingle && projects.length <= 1) return null;
  if (projects.length === 0) return null;

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
          disabled={ctx.isSwitchingProject}
          title="Chọn dự án làm việc"
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {ctx.isSwitchingProject ? (
              <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
            ) : (
              <Briefcase className="size-3.5 shrink-0 text-primary" />
            )}
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
              disabled={ctx.isSwitchingProject}
              onClick={() => void ctx.switchProject(project.id)}
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
