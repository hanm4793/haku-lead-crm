"use client";

import * as React from "react";
import { ExternalLink, Loader2, Plus, RefreshCw } from "lucide-react";
import { useRouter } from "next/navigation";

import {
  addPagesToProjectAction,
  assignPageToProjectAction,
  assignPartnerToProjectAction,
  checkProjectPagesAction,
  listAccessiblePagesAction,
  removeAdAccountAction,
  removePartnerFromProjectAction,
  setAdAccountActiveAction,
  setProjectPageActiveAction,
  upsertAdAccountAction,
  type AccessiblePageOption,
  type ProjectActionResult,
} from "@/app/projects/actions";
import { ConfirmDialog, FormDialog, FormField, RowActions } from "@/components/common/crud-dialogs";
import { DataTable, ListPanel, type DataColumn } from "@/components/common/data-table";
import {
  ActiveSwitch,
  FilterSelect,
  ListToolbar,
  matchesStatus,
  STATUS_FILTER_OPTIONS,
} from "@/components/common/list-toolbar";
import { useToast } from "@/components/providers/toast-provider";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { AdPlatform, ProjectAdAccountRow } from "@/lib/db/project-repo";

export type PageRow = {
  id: string;
  facebookPageId: string;
  name: string | null;
  projectId: string | null;
  active: boolean;
};
export type PartnerRow = { id: string; fullName: string; email: string | null; projectId: string | null };

type Outcome = { ok: boolean; error?: string };

/** Chạy một thao tác server: lỗi và thành công đều báo bằng toast, thành công thì làm mới dữ liệu. */
function useRunner() {
  const router = useRouter();
  const toast = useToast();
  const [pending, setPending] = React.useState(false);
  const run = async (action: () => Promise<Outcome>, success: string) => {
    setPending(true);
    try {
      const outcome = await action();
      if (!outcome.ok) {
        toast.error("Không thực hiện được", outcome.error ?? "Thao tác thất bại.");
        return false;
      }
      toast.success(success);
      router.refresh();
      return true;
    } finally {
      setPending(false);
    }
  };
  return { pending, run, toast };
}

const asOutcome = (result: ProjectActionResult | { ok: true } | { ok: false; error: string }): Outcome => result;

/* ------------------------------------------------------------------ Fanpage */

export function ProjectPagesTable({
  projectId,
  pages,
  canManage,
}: {
  projectId: string;
  pages: PageRow[];
  canManage: boolean;
}) {
  const router = useRouter();
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [removing, setRemoving] = React.useState<PageRow | null>(null);
  const [checking, setChecking] = React.useState(false);

  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [loadingList, setLoadingList] = React.useState(false);
  const [listFailed, setListFailed] = React.useState(false);
  const [accessible, setAccessible] = React.useState<AccessiblePageOption[]>([]);
  const [unassignedPageIds, setUnassignedPageIds] = React.useState<Set<string>>(new Set());
  const [selected, setSelected] = React.useState<string[]>([]);
  const [listQuery, setListQuery] = React.useState("");
  const { pending, run, toast } = useRunner();

  React.useEffect(() => {
    if (!canManage) return;
    let cancelled = false;
    void listAccessiblePagesAction(projectId).then((res) => {
      if (!cancelled && res.ok) {
        setAccessible(res.pages);
        setUnassignedPageIds(new Set(res.pages.filter((p) => p.tokenAssigned === false).map((p) => p.facebookPageId)));
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [canManage, projectId]);

  const mine = React.useMemo(() => pages.filter((p) => p.projectId === projectId), [pages, projectId]);

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return mine.filter(
      (p) =>
        matchesStatus(status, p.active) &&
        (!q || (p.name ?? "").toLowerCase().includes(q) || p.facebookPageId.includes(q)),
    );
  }, [mine, query, status]);

  const columns: DataColumn<PageRow>[] = [
    {
      id: "name",
      header: "Fanpage",
      sortValue: (p) => p.name ?? "",
      cell: (p) => (
        <a
          href={`https://www.facebook.com/${p.facebookPageId}`}
          target="_blank"
          rel="noreferrer"
          title="Mở trang Facebook"
          className="font-semibold text-slate-800 hover:text-primary hover:underline"
        >
          <span>{p.name?.trim() || "Chưa có tên"}</span>
          {unassignedPageIds.has(p.facebookPageId) ? (
            <Badge
              variant="warning"
              className="ml-2"
              title="Fanpage này nằm trong BM nhưng chưa được assign quyền cho tài khoản Facebook kết nối Token. Chỉ đọc được số liệu Ads, chưa kéo được Lead trực tiếp từ Page."
            >
              Chưa assign quyền Page cho Token
            </Badge>
          ) : null}
        </a>
      ),
    },
    {
      id: "pageId",
      header: "Page ID",
      sortValue: (p) => p.facebookPageId,
      cell: (p) => <span className="font-mono text-[12px] text-slate-600">{p.facebookPageId}</span>,
    },
    {
      id: "admin",
      header: "Quản trị",
      cell: (p) => (
        <a
          href={`https://business.facebook.com/latest/home?asset_id=${p.facebookPageId}`}
          target="_blank"
          rel="noreferrer"
          className="inline-flex items-center gap-1 text-[12px] font-medium text-primary hover:underline"
        >
          Meta Business Suite
          <ExternalLink className="size-3" />
        </a>
      ),
    },
    {
      id: "active",
      header: "Trạng thái",
      sortValue: (p) => p.active,
      cell: (p) =>
        canManage ? (
          <ActiveSwitch
            checked={p.active}
            disabled={pending}
            onChange={(active) =>
              void run(async () => asOutcome(await setProjectPageActiveAction({ id: p.id, active })), "Đã cập nhật trạng thái fanpage.")
            }
          />
        ) : (
          <Badge variant={p.active ? "success" : "muted"}>{p.active ? "Đang bật" : "Đang tắt"}</Badge>
        ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: 60,
            cell: (p: PageRow) => <RowActions deleteTitle="Gỡ khỏi dự án" onDelete={() => setRemoving(p)} />,
          },
        ]
      : []),
  ];

  const openPicker = async () => {
    setDialogOpen(true);
    setSelected([]);
    setListQuery("");
    setListFailed(false);
    setLoadingList(true);
    const result = await listAccessiblePagesAction(projectId);
    setLoadingList(false);
    if (!result.ok) {
      setAccessible([]);
      setListFailed(true);
      toast.error("Không lấy được danh sách fanpage từ Facebook", result.error);
      return;
    }
    setAccessible(result.pages);
    setUnassignedPageIds(
      new Set(result.pages.filter((p) => p.tokenAssigned === false).map((p) => p.facebookPageId)),
    );
  };

  const check = async () => {
    setChecking(true);
    try {
      const result = await checkProjectPagesAction(projectId);
      if (!result.ok) {
        toast.error("Không kiểm tra được với Facebook", result.error);
        return;
      }
      if (result.missing.length === 0) {
        toast.success(`Đã kiểm tra ${result.checked} fanpage`, "Tài khoản Facebook có quyền với tất cả.");
      } else {
        toast.warning(
          `Thiếu quyền với ${result.missing.length}/${result.checked} fanpage`,
          `${result.missing.join(", ")}. Hãy cấp quyền quản trị trên Meta.`,
        );
      }
      router.refresh();
    } finally {
      setChecking(false);
    }
  };

  const visibleAccessible = accessible.filter((p) => {
    const q = listQuery.trim().toLowerCase();
    return !q || (p.name ?? "").toLowerCase().includes(q) || p.facebookPageId.includes(q);
  });

  return (
    <div className="space-y-3">
      <ListPanel
        toolbar={
          <ListToolbar
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / Page ID" }}
            filters={<FilterSelect value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />}
            actions={
              canManage && (
                <>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    disabled={checking || mine.length === 0}
                    onClick={() => void check()}
                  >
                    {checking ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
                    Kiểm tra với Facebook
                  </Button>
                  <Button size="sm" className="gap-1.5" onClick={() => void openPicker()}>
                    <Plus className="size-3.5" />
                    Thêm từ Facebook
                  </Button>
                </>
              )
            }
          />
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          unit="fanpage"
          emptyMessage="Dự án chưa có fanpage nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Thêm fanpage từ Facebook"
        description="Danh sách fanpage mà tài khoản Facebook của hệ thống đang có quyền. Muốn thêm page khác, hãy cấp quyền cho tài khoản đó trên Meta."
        submitLabel={selected.length > 0 ? `Thêm ${selected.length} fanpage` : "Thêm fanpage"}
        pending={pending}
        disabled={selected.length === 0 || loadingList}
        onSubmit={async () => {
          const ok = await run(
            async () => asOutcome(await addPagesToProjectAction({ projectId, facebookPageIds: selected })),
            `Đã thêm ${selected.length} fanpage vào dự án.`,
          );
          if (ok) setDialogOpen(false);
        }}
      >
        {loadingList ? (
          <p className="flex items-center gap-2 py-6 text-[13px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            Đang lấy danh sách từ Facebook…
          </p>
        ) : accessible.length === 0 ? (
          !listFailed && (
            <p className="py-4 text-[13px] text-muted-foreground">
              Tài khoản Facebook chưa có quyền với fanpage nào. Hãy cấp quyền quản trị fanpage trên Meta rồi mở lại.
            </p>
          )
        ) : (
          <div className="space-y-2">
            <Input
              value={listQuery}
              onChange={(e) => setListQuery(e.target.value)}
              placeholder="Tìm tên / Page ID"
              className="h-8 text-[13px]"
            />
            <ul className="thin-scrollbar max-h-72 space-y-1 overflow-auto">
              {visibleAccessible.map((page) => {
                const disabled = page.state !== "available";
                const checked = disabled ? page.state === "in_project" : selected.includes(page.facebookPageId);
                return (
                  <li key={page.facebookPageId}>
                    <label
                      className={`flex items-center gap-2.5 rounded-md border border-border/60 px-2.5 py-1.5 text-[13px] ${disabled ? "opacity-60" : "cursor-pointer hover:bg-muted/40"}`}
                    >
                      <Checkbox
                        checked={checked}
                        disabled={disabled}
                        onCheckedChange={(value) =>
                          setSelected((prev) =>
                            value ? [...prev, page.facebookPageId] : prev.filter((id) => id !== page.facebookPageId),
                          )
                        }
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium text-slate-800">{page.name ?? "Chưa có tên"}</span>
                        <span className="block font-mono text-[11px] text-muted-foreground">{page.facebookPageId}</span>
                        {page.tokenAssigned === false && (
                          <span className="mt-0.5 block text-[11px] font-medium text-amber-700">
                            ⚠ Chưa assign quyền Page cho tài khoản Token trên BM (chỉ có dữ liệu Ads, chưa kéo được Lead)
                          </span>
                        )}
                      </span>
                      {page.state === "in_project" && <Badge variant="success">Đã trong dự án</Badge>}
                      {page.state === "other_project" && (
                        <Badge variant="muted">Thuộc {page.otherProjectName ?? "dự án khác"}</Badge>
                      )}
                    </label>
                  </li>
                );
              })}
            </ul>
          </div>
        )}
      </FormDialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Gỡ fanpage khỏi dự án"
        description={
          <>
            Gỡ <strong>«{removing?.name?.trim() || removing?.facebookPageId}»</strong> khỏi dự án này?
          </>
        }
        note="Fanpage vẫn còn trong hệ thống và quay về danh sách chưa gán. Lead cũ không bị xóa."
        confirmLabel="Gỡ khỏi dự án"
        pending={pending}
        onConfirm={async () => {
          if (!removing) return;
          await run(async () => asOutcome(await assignPageToProjectAction({ pageId: removing.id, projectId: null })), "Đã gỡ fanpage khỏi dự án.");
          setRemoving(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Partner */

export function ProjectPartnersTable({
  projectId,
  partners,
  available,
  canManage,
}: {
  projectId: string;
  partners: PartnerRow[];
  available: PartnerRow[];
  canManage: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [partnerId, setPartnerId] = React.useState("");
  const [removing, setRemoving] = React.useState<PartnerRow | null>(null);
  const { pending, run } = useRunner();

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return partners.filter((p) => !q || `${p.fullName} ${p.email ?? ""}`.toLowerCase().includes(q));
  }, [partners, query]);

  const columns: DataColumn<PartnerRow>[] = [
    { id: "name", header: "Partner admin", sortValue: (p) => p.fullName, cell: (p) => <span className="font-semibold text-slate-800">{p.fullName}</span> },
    { id: "email", header: "Email", sortValue: (p) => p.email ?? "", cell: (p) => p.email ?? <span className="text-slate-300">—</span> },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: 60,
            cell: (p: PartnerRow) => <RowActions deleteTitle="Gỡ khỏi dự án" onDelete={() => setRemoving(p)} />,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <ListPanel
        toolbar={
          <ListToolbar
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / email" }}
            actions={
              canManage && (
                <Button
                  size="sm"
                  className="gap-1.5"
                  disabled={available.length === 0}
                  title={available.length === 0 ? "Không còn partner nào để gán" : undefined}
                  onClick={() => {
                    setPartnerId("");
                    setDialogOpen(true);
                  }}
                >
                  <Plus className="size-3.5" />
                  Gán partner
                </Button>
              )
            }
          />
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(p) => p.id}
          unit="partner"
          emptyMessage="Dự án chưa có partner nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title="Gán partner vào dự án"
        description="Nhân viên của partner được thừa hưởng quyền truy cập dự án này."
        submitLabel="Gán partner"
        pending={pending}
        disabled={!partnerId}
        onSubmit={async () => {
          const ok = await run(async () => asOutcome(await assignPartnerToProjectAction({ partnerId, projectId })), "Đã gán partner vào dự án.");
          if (ok) setDialogOpen(false);
        }}
      >
        <FormField label="Partner admin" required>
          <Select value={partnerId} onValueChange={setPartnerId}>
            <SelectTrigger>
              <SelectValue placeholder="Chọn partner…" />
            </SelectTrigger>
            <SelectContent>
              {available.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.fullName}
                  {p.email ? ` · ${p.email}` : ""}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(removing)}
        onOpenChange={(open) => !open && setRemoving(null)}
        title="Gỡ partner khỏi dự án"
        description={
          <>
            Gỡ <strong>«{removing?.fullName}»</strong> khỏi dự án này?
          </>
        }
        note="Tài khoản vẫn còn, chỉ mất quyền truy cập dự án này."
        confirmLabel="Gỡ khỏi dự án"
        pending={pending}
        onConfirm={async () => {
          if (!removing) return;
          await run(async () => asOutcome(await removePartnerFromProjectAction({ partnerId: removing.id, projectId })), "Đã gỡ partner khỏi dự án.");
          setRemoving(null);
        }}
      />
    </div>
  );
}

/* ------------------------------------------------------------------ Ads */

const PLATFORM_LABELS: Record<AdPlatform, string> = {
  google: "Google Ads",
  tiktok: "TikTok Ads",
  zalo: "Zalo OA",
};

const PLATFORM_FILTER = [
  { value: "all", label: "Mọi nền tảng" },
  ...(Object.entries(PLATFORM_LABELS) as [AdPlatform, string][]).map(([value, label]) => ({ value, label })),
];

export function ProjectAdAccountsTable({
  projectId,
  accounts,
  canManage,
}: {
  projectId: string;
  accounts: ProjectAdAccountRow[];
  canManage: boolean;
}) {
  const [query, setQuery] = React.useState("");
  const [status, setStatus] = React.useState("all");
  const [platformFilter, setPlatformFilter] = React.useState("all");
  const [dialogOpen, setDialogOpen] = React.useState(false);
  const [editing, setEditing] = React.useState<ProjectAdAccountRow | null>(null);
  const [form, setForm] = React.useState<{ platform: AdPlatform; externalAccountId: string; name: string }>({
    platform: "google",
    externalAccountId: "",
    name: "",
  });
  const [deleting, setDeleting] = React.useState<ProjectAdAccountRow | null>(null);
  const { pending, run } = useRunner();

  const rows = React.useMemo(() => {
    const q = query.trim().toLowerCase();
    return accounts.filter(
      (a) =>
        matchesStatus(status, a.active) &&
        (platformFilter === "all" || a.platform === platformFilter) &&
        (!q || `${a.name ?? ""} ${a.externalAccountId}`.toLowerCase().includes(q)),
    );
  }, [accounts, query, status, platformFilter]);

  const openForm = (account: ProjectAdAccountRow | null) => {
    setEditing(account);
    setForm({
      platform: account?.platform ?? "google",
      externalAccountId: account?.externalAccountId ?? "",
      name: account?.name ?? "",
    });
    setDialogOpen(true);
  };

  const columns: DataColumn<ProjectAdAccountRow>[] = [
    {
      id: "platform",
      header: "Nền tảng",
      sortValue: (a) => PLATFORM_LABELS[a.platform],
      cell: (a) => <Badge variant="outline">{PLATFORM_LABELS[a.platform]}</Badge>,
    },
    { id: "name", header: "Tên", sortValue: (a) => a.name ?? "", cell: (a) => <span className="font-semibold text-slate-800">{a.name || "—"}</span> },
    {
      id: "account",
      header: "Account ID",
      sortValue: (a) => a.externalAccountId,
      cell: (a) => <span className="font-mono text-[12px] text-slate-600">{a.externalAccountId}</span>,
    },
    {
      id: "active",
      header: "Trạng thái",
      sortValue: (a) => a.active,
      cell: (a) =>
        canManage ? (
          <ActiveSwitch
            checked={a.active}
            disabled={pending}
            onChange={(active) =>
              void run(async () => asOutcome(await setAdAccountActiveAction({ id: a.id, active })), "Đã cập nhật trạng thái tài khoản ads.")
            }
          />
        ) : (
          <Badge variant={a.active ? "success" : "muted"}>{a.active ? "Đang bật" : "Đang tắt"}</Badge>
        ),
    },
    ...(canManage
      ? [
          {
            id: "actions",
            header: "",
            align: "right" as const,
            width: 90,
            cell: (a: ProjectAdAccountRow) => (
              <RowActions editTitle="Sửa tài khoản" deleteTitle="Xóa tài khoản" onEdit={() => openForm(a)} onDelete={() => setDeleting(a)} />
            ),
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-3">
      <ListPanel
        toolbar={
          <ListToolbar
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / Account ID" }}
            filters={
              <>
                <FilterSelect value={status} onChange={setStatus} options={STATUS_FILTER_OPTIONS} />
                <FilterSelect value={platformFilter} onChange={setPlatformFilter} options={PLATFORM_FILTER} />
              </>
            }
            actions={
              canManage && (
                <Button size="sm" className="gap-1.5" onClick={() => openForm(null)}>
                  <Plus className="size-3.5" />
                  Thêm tài khoản
                </Button>
              )
            }
          />
        }
      >
        <DataTable
          columns={columns}
          rows={rows}
          getRowKey={(a) => a.id}
          onRowClick={canManage ? openForm : undefined}
          unit="tài khoản"
          emptyMessage="Dự án chưa có tài khoản ads nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <FormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        title={editing ? "Sửa tài khoản ads" : "Thêm tài khoản ads"}
        description="Hiện chỉ lưu cấu hình kết nối, chưa đồng bộ dữ liệu từ nền tảng này."
        submitLabel={editing ? "Lưu thay đổi" : "Thêm tài khoản"}
        pending={pending}
        disabled={!form.externalAccountId.trim()}
        onSubmit={async () => {
          const ok = await run(
            async () =>
              asOutcome(
                await upsertAdAccountAction({
                  projectId,
                  platform: form.platform,
                  externalAccountId: form.externalAccountId,
                  name: form.name.trim() || null,
                }),
              ),
            editing ? "Đã cập nhật tài khoản ads." : "Đã thêm tài khoản ads.",
          );
          if (ok) setDialogOpen(false);
        }}
      >
        <FormField label="Nền tảng">
          <Select
            value={form.platform}
            onValueChange={(v) => setForm((f) => ({ ...f, platform: v as AdPlatform }))}
            disabled={Boolean(editing)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.entries(PLATFORM_LABELS) as [AdPlatform, string][]).map(([value, label]) => (
                <SelectItem key={value} value={value}>
                  {label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </FormField>
        <FormField label="Account ID" required>
          <Input
            value={form.externalAccountId}
            onChange={(e) => setForm((f) => ({ ...f, externalAccountId: e.target.value }))}
            className="font-mono text-[13px]"
            disabled={Boolean(editing)}
            autoFocus
          />
        </FormField>
        <FormField label="Tên gợi nhớ">
          <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
        </FormField>
      </FormDialog>

      <ConfirmDialog
        open={Boolean(deleting)}
        onOpenChange={(open) => !open && setDeleting(null)}
        title="Xóa tài khoản ads"
        description={
          <>
            Xóa <strong>«{deleting?.name || deleting?.externalAccountId}»</strong> khỏi dự án?
          </>
        }
        pending={pending}
        onConfirm={async () => {
          if (!deleting) return;
          await run(async () => asOutcome(await removeAdAccountAction(deleting.id)), "Đã xóa tài khoản ads.");
          setDeleting(null);
        }}
      />
    </div>
  );
}
