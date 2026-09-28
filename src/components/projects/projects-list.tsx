"use client";

import * as React from "react";
import Link from "next/link";

import { createProjectAction } from "@/app/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectListStats } from "@/lib/db/project-repo";

export function ProjectsList({
  projects,
  canCreate,
}: {
  projects: ProjectListStats[];
  canCreate: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const filtered = projects.filter((p) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q);
  });

  const create = async () => {
    setPending(true);
    setError(null);
    const result = await createProjectAction({ slug: newSlug, name: newName });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNewSlug("");
    setNewName("");
    window.location.href = `/projects/${result.project.id}`;
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Tìm theo tên hoặc slug…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="max-w-xs"
        />
      </div>

      {canCreate && (
        <div className="rounded-lg border border-dashed border-border p-3 space-y-2">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">Tạo project mới</div>
          <div className="flex flex-wrap gap-2">
            <Input placeholder="slug" value={newSlug} onChange={(e) => setNewSlug(e.target.value)} className="max-w-[160px]" />
            <Input placeholder="Tên hiển thị" value={newName} onChange={(e) => setNewName(e.target.value)} className="max-w-[200px]" />
            <Button size="sm" disabled={pending} onClick={() => void create()}>
              Tạo
            </Button>
          </div>
          {error && <p className="text-[13px] text-rose-600">{error}</p>}
        </div>
      )}

      <div className="overflow-x-auto rounded-lg border border-border">
        <table className="w-full min-w-[640px] text-left text-[13px]">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-semibold">Tên</th>
              <th className="px-3 py-2 font-semibold">Slug</th>
              <th className="px-3 py-2 font-semibold">Fanpage</th>
              <th className="px-3 py-2 font-semibold">Partner</th>
              <th className="px-3 py-2 font-semibold">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((project) => (
              <tr key={project.id} className="border-b border-border/60 last:border-0 hover:bg-muted/20">
                <td className="px-3 py-2.5 font-medium">
                  <Link href={`/projects/${project.id}`} className="text-primary hover:underline">
                    {project.name}
                  </Link>
                </td>
                <td className="px-3 py-2.5 font-mono text-[12px] text-muted-foreground">{project.slug}</td>
                <td className="px-3 py-2.5">{project.pageCount}</td>
                <td className="px-3 py-2.5">{project.partnerCount}</td>
                <td className="px-3 py-2.5">
                  <Badge variant={project.active ? "success" : "muted"}>{project.active ? "Đang bật" : "Tắt"}</Badge>
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">
                  Không có project phù hợp.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
