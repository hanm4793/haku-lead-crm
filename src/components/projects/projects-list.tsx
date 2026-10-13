"use client";

import * as React from "react";
import { FolderKanban, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

import { createProjectAction } from "@/app/projects/actions";
import { FormDialog, FormField } from "@/components/common/crud-dialogs";
import { DataTable, ListPanel, type DataColumn } from "@/components/common/data-table";
import { FilterSelect, ListToolbar, matchesStatus, STATUS_FILTER_OPTIONS } from "@/components/common/list-toolbar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { ProjectListStats } from "@/lib/db/project-repo";
import { useToast } from "@/components/providers/toast-provider";

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/đ/g, "d")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

const COLUMNS: DataColumn<ProjectListStats>[] = [
  {
    id: "name",
    header: "Tên dự án",
    sortValue: (p) => p.name,
    cell: (p) => (
      <Link href={`/projects/${p.id}`} className="inline-flex items-center gap-2 font-semibold text-slate-800 hover:text-primary">
        <span className="flex size-6 items-center justify-center rounded-md bg-primary/10 text-primary">
          <FolderKanban className="size-3.5" />
        </span>
        {p.name}
      </Link>
    ),
  },
  {
    id: "slug",
    header: "Slug",
    sortValue: (p) => p.slug,
    cell: (p) => <span className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[12px] text-slate-600">{p.slug}</span>,
  },
  { id: "pages", header: "Fanpage", align: "center", sortValue: (p) => p.pageCount, cell: (p) => p.pageCount },
  { id: "partners", header: "Partner", align: "center", sortValue: (p) => p.partnerCount, cell: (p) => p.partnerCount },
  {
    id: "active",
    header: "Trạng thái",
    sortValue: (p) => p.active,
    cell: (p) => <Badge variant={p.active ? "success" : "muted"}>{p.active ? "Đang bật" : "Đang tắt"}</Badge>,
  },
];

export function ProjectsList({
  projects,
  canCreate,
}: {
  projects: ProjectListStats[];
  canCreate: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [newSlug, setNewSlug] = React.useState("");
  const [newName, setNewName] = React.useState("");
  const [slugTouched, setSlugTouched] = React.useState(false);
  const [pending, setPending] = React.useState(false);

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return projects.filter(
      (p) =>
        matchesStatus(status, p.active) &&
        (!q || p.name.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q)),
    );
  }, [projects, query, status]);

  const create = async () => {
    setPending(true);
    const result = await createProjectAction({ slug: newSlug, name: newName });
    setPending(false);
    if (!result.ok) {
      toast.error("Không tạo được dự án", result.error);
      return;
    }
    toast.success(`Đã tạo dự án «${result.project.name}».`);
    setDialogOpen(false);
    router.push(`/projects/${result.project.id}`);
  };

  return (
    <>
      <ListPanel
        toolbar={
          <ListToolbar
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / slug" }}
            filters={<FilterSelect value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />}
            actions={
              canCreate && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  onClick={() => {
                    setNewSlug("");
                    setSlugTouched(false);
                    setNewName("");
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-3.5" />
                  Tạo dự án
                </Button>
              )
            }
          />
        }
      >
        <DataTable
          columns={COLUMNS}
          rows={filtered}
          getRowKey={(p) => p.id}
          onRowClick={(p) => router.push(`/projects/${p.id}`)}
          unit="dự án"
          defaultSort={{ columnId: "name", order: "asc" }}
          emptyMessage="Không có dự án nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Tạo dự án mới"
        description="Mỗi dự án là một không gian làm việc riêng cho doanh nghiệp hoặc ngành hàng."
        submitLabel="Tạo dự án"
        pending={pending}
        disabled={!newName.trim() || !newSlug.trim()}
        onSubmit={() => void create()}
      >
        <FormField label="Tên dự án" required>
          <Input
            placeholder="VD: Đại lý Kia Mazda, Bất động sản Vinhomes…"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
              if (!slugTouched) setNewSlug(slugify(e.target.value));
            }}
          />
        </FormField>
        <FormField label="Mã slug" required hint="Dùng làm định danh, chỉ gồm chữ thường, số và dấu gạch ngang.">
          <Input
            placeholder="VD: kia-mazda"
            value={newSlug}
            onChange={(e) => {
              setSlugTouched(true);
              setNewSlug(e.target.value);
            }}
            className="font-mono text-[13px]"
          />
        </FormField>
      </FormDialog>
    </>
  );
}
