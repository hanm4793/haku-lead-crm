"use client";

import * as React from "react";
import { FolderKanban, Plus, Search } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createProjectAction } from "@/app/projects/actions";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ProjectListStats } from "@/lib/db/project-repo";

export function ProjectsList({
  projects,
  canCreate,
}: {
  projects: ProjectListStats[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [createDialogOpen, setCreateDialogOpen] = React.useState(false);
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
    setCreateDialogOpen(false);
    router.push(`/projects/${result.project.id}`);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative min-w-[240px] max-w-xs flex-1">
          <Search className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
          <Input
            placeholder="Tìm theo tên hoặc slug…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="h-8.5 pl-8 text-[12.5px]"
          />
        </div>

        {canCreate && (
          <Button
            size="sm"
            onClick={() => {
              setNewSlug("");
              setNewName("");
              setError(null);
              setCreateDialogOpen(true);
            }}
            className="gap-1.5 shadow-xs"
          >
            <Plus className="size-3.5" />
            <span>Tạo dự án mới</span>
          </Button>
        )}
      </div>

      {/* Table danh sách dự án */}
      <div className="overflow-hidden rounded-xl border border-border/80 bg-card shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-[13px]">
            <thead className="border-b border-border/80 bg-slate-50/80 text-[11.5px] uppercase tracking-wider text-slate-500 font-semibold">
              <tr>
                <th className="py-2.5 pl-4 pr-3">Tên dự án</th>
                <th className="px-3 py-2.5">Slug định danh</th>
                <th className="px-3 py-2.5 text-center">Fanpage</th>
                <th className="px-3 py-2.5 text-center">Partner</th>
                <th className="px-3 py-2.5">Trạng thái</th>
                <th className="py-2.5 pl-3 pr-4 text-right">Chi tiết</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border/60">
              {filtered.map((project) => (
                <tr key={project.id} className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3 pl-4 pr-3">
                    <Link
                      href={`/projects/${project.id}`}
                      className="font-semibold text-slate-900 hover:text-primary transition-colors flex items-center gap-2"
                    >
                      <span className="flex size-7 items-center justify-center rounded-md bg-primary/10 text-primary">
                        <FolderKanban className="size-3.5" />
                      </span>
                      <span>{project.name}</span>
                    </Link>
                  </td>
                  <td className="px-3 py-3 font-mono text-[12px] text-slate-600">
                    <span className="rounded bg-slate-100 px-1.5 py-0.5">{project.slug}</span>
                  </td>
                  <td className="px-3 py-3 text-center font-medium">{project.pageCount}</td>
                  <td className="px-3 py-3 text-center font-medium">{project.partnerCount}</td>
                  <td className="px-3 py-3">
                    <Badge variant={project.active ? "success" : "muted"} className="text-[11px]">
                      {project.active ? "Đang bật" : "Đang tắt"}
                    </Badge>
                  </td>
                  <td className="py-3 pl-3 pr-4 text-right">
                    <Link
                      href={`/projects/${project.id}`}
                      className="text-[12px] font-medium text-primary hover:underline"
                    >
                      Quản lý →
                    </Link>
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-muted-foreground text-[12.5px]">
                    Không có dự án nào phù hợp.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog tạo dự án mới */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Tạo dự án mới</DialogTitle>
            <DialogDescription>
              Tạo không gian làm việc riêng biệt cho từng doanh nghiệp hoặc ngành hàng.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3.5 py-2">
            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Tên dự án <span className="text-rose-600">*</span>
              </Label>
              <Input
                placeholder="VD: Showroom Kia Mazda, Bất động sản Vinhomes..."
                value={newName}
                onChange={(e) => {
                  setNewName(e.target.value);
                  if (!newSlug) {
                    const slug = e.target.value
                      .toLowerCase()
                      .normalize("NFD")
                      .replace(/[\u0300-\u036f]/g, "")
                      .replace(/đ/g, "d")
                      .replace(/[^a-z0-9]+/g, "-")
                      .replace(/^-+|-+$/g, "");
                    setNewSlug(slug);
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[13px]">
                Mã Slug (URL định danh) <span className="text-rose-600">*</span>
              </Label>
              <Input
                placeholder="VD: kia-mazda, bds-vinhomes"
                value={newSlug}
                onChange={(e) => setNewSlug(e.target.value)}
                className="font-mono text-[13px]"
              />
            </div>

            {error && <p className="text-[12.5px] text-rose-600">{error}</p>}
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setCreateDialogOpen(false)}>
              Hủy
            </Button>
            <Button
              type="button"
              disabled={pending || !newName.trim() || !newSlug.trim()}
              onClick={() => void create()}
            >
              Tạo dự án
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
