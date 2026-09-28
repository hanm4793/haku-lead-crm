"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { ChevronsUpDown } from "lucide-react";

import { setActiveProjectAction } from "@/app/projects/actions";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

export function ProjectSwitcher({
  projects,
  activeProjectId,
  className,
  hideWhenSingle = true,
}: {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  className?: string;
  /** Staff: ẩn khi chỉ 1 project; super/partner vẫn hiện. */
  hideWhenSingle?: boolean;
}) {
  const router = useRouter();
  const [pending, setPending] = React.useState(false);
  const active = projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  if (hideWhenSingle && projects.length <= 1) return null;
  if (projects.length === 0) return null;

  const switchTo = async (projectId: string) => {
    if (projectId === activeProjectId || pending) return;
    setPending(true);
    const result = await setActiveProjectAction(projectId);
    setPending(false);
    if (result.ok) router.refresh();
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn("h-8 max-w-[220px] justify-between gap-2 text-[13px] font-medium", className)}
          disabled={pending}
        >
          <span className="truncate">{active?.name ?? "Project"}</span>
          <ChevronsUpDown className="size-3.5 shrink-0 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-[220px]">
        {projects.map((project) => (
          <DropdownMenuItem
            key={project.id}
            onClick={() => void switchTo(project.id)}
            className={cn(project.id === active?.id && "bg-accent")}
          >
            <span className="truncate">{project.name}</span>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
