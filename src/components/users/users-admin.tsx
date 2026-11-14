"use client";

import * as React from "react";
import { Plus, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { createUserAction, resendPasswordEmailAction, updateUserAction } from "@/app/users/actions";
import { DataTable, ListPanel, type DataColumn } from "@/components/common/data-table";
import { CountTabs, FilterSelect, ListToolbar } from "@/components/common/list-toolbar";
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
import { MultiSelect } from "@/components/ui/multi-select";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { canManageProjects, ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import type { ManagedUser } from "@/lib/db/users-repo";
import { useToast } from "@/components/providers/toast-provider";

type PageOption = { value: string; label: string; projectId?: string | null };
type PartnerOption = { id: string; name: string; projectIds?: string[] };
type ProjectOption = { id: string; name: string };

type FormState = {
  fullName: string;
  email: string;
  role: "PARTNER_ADMIN" | "STAFF";
  partnerId: string | null;
  projectIds: string[];
  pageIds: string[];
  aiEnabled: boolean;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  role: "STAFF",
  partnerId: null,
  projectIds: [],
  pageIds: [],
  aiEnabled: false,
  active: true,
};

function toForm(user: ManagedUser | null, isSuper: boolean): FormState {
  if (!user) {
    return { ...EMPTY_FORM, role: isSuper ? "PARTNER_ADMIN" : "STAFF" };
  }
  const projectIds =
    user.projectIds?.length > 0
      ? user.projectIds
      : user.projectId
        ? [user.projectId]
        : [];
  return {
    fullName: user.fullName,
    email: user.email ?? "",
    role: user.role === "PARTNER_ADMIN" ? "PARTNER_ADMIN" : "STAFF",
    partnerId: user.partnerId,
    projectIds,
    pageIds: user.pageIds,
    aiEnabled: user.aiEnabled,
    active: user.active,
  };
}

export function UsersAdmin({
  initialUsers,
  pages,
  partners,
  projects,
  actorRole,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  pages: PageOption[];
  partners: PartnerOption[];
  projects: ProjectOption[];
  actorRole: UserRole;
  currentUserId: string | null;
}) {
  const router = useRouter();
  const toast = useToast();
  const isSuper = canManageProjects(actorRole);
  const [users, setUsers] = React.useState(initialUsers);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"PARTNER_ADMIN" | "STAFF">(isSuper ? "PARTNER_ADMIN" : "STAFF");
  const [editing, setEditing] = React.useState<ManagedUser | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [pending, setPending] = React.useState(false);

  const [prevInitial, setPrevInitial] = React.useState(initialUsers);
  if (prevInitial !== initialUsers) {
    setPrevInitial(initialUsers);
    setUsers(initialUsers);
  }

  const [statusFilter, setStatusFilter] = React.useState("all");
  const [partnerFilter, setPartnerFilter] = React.useState("all");
  const [projectFilter, setProjectFilter] = React.useState("all");

  const projectNameById = React.useMemo(
    () => new Map(projects.map((p) => [p.id, p.name])),
    [projects],
  );

  const visible = users.filter((user) => {
    if (isSuper && user.role !== tab) return false;
    if (isSuper && user.role === "SUPER_ADMIN") return false;
    if (statusFilter !== "all" && user.active !== (statusFilter === "active")) return false;
    if (projectFilter !== "all" && !user.projectIds.includes(projectFilter)) return false;
    if (isSuper && tab === "STAFF" && partnerFilter !== "all" && user.partnerId !== partnerFilter) return false;
    const projectNames = user.projectIds
      .map((id) => projectNameById.get(id) ?? "")
      .join(" ");
    const haystack = `${user.fullName} ${user.email ?? ""} ${user.partnerName ?? ""} ${projectNames}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const countByRole = (role: "PARTNER_ADMIN" | "STAFF") => users.filter((u) => u.role === role).length;

  const showPartnerColumn = tab === "STAFF" && isSuper;
  const columns: DataColumn<ManagedUser>[] = [
    {
      id: "name",
      header: "Tên",
      sortValue: (u) => u.fullName,
      cell: (u) => (
        <span className="inline-flex items-center gap-1.5 font-semibold text-slate-800">
          {u.role === "PARTNER_ADMIN" && <Shield className="size-3.5 text-primary" />}
          {u.fullName}
          {u.id === currentUserId && <span className="text-[11px] font-normal text-muted-foreground">(bạn)</span>}
        </span>
      ),
    },
    {
      id: "email",
      header: "Email",
      sortValue: (u) => u.email ?? "",
      cell: (u) => (u.email ? <span className="text-slate-600">{u.email}</span> : <span className="text-slate-300">Chưa có email</span>),
    },
    ...(showPartnerColumn
      ? [{ id: "partner", header: "Partner", sortValue: (u: ManagedUser) => u.partnerName ?? "", cell: (u: ManagedUser) => u.partnerName ?? <span className="text-slate-300">—</span> }]
      : []),
    {
      id: "projects",
      header: "Dự án",
      sortValue: (u) => u.projectIds.length,
      cell: (u) => {
        const count = u.projectIds.length;
        if (count === 0) {
          return <span className="text-slate-300">Chưa gán dự án</span>;
        }
        const names = u.projectIds
          .map((id) => projectNameById.get(id))
          .filter((name): name is string => Boolean(name));
        return (
          <div className="flex flex-col gap-0.5" title={names.length > 0 ? names.join(", ") : undefined}>
            <span className="font-medium tabular-nums text-slate-700">{count} dự án</span>
            {names.length > 0 && (
              <span className="max-w-[220px] truncate text-[11px] text-muted-foreground">
                {names.join(", ")}
              </span>
            )}
          </div>
        );
      },
    },
    ...(tab === "PARTNER_ADMIN"
      ? [
          {
            id: "pages",
            header: "Fanpage",
            sortValue: (u: ManagedUser) => u.pageIds.length,
            cell: (u: ManagedUser) => (u.pageIds.length === 0 ? <span className="text-slate-300">Chưa gán page</span> : <span className="tabular-nums">{u.pageIds.length} page</span>),
          },
          {
            id: "ai",
            header: "AI",
            sortValue: (u: ManagedUser) => u.aiEnabled,
            cell: (u: ManagedUser) => <Badge variant={u.aiEnabled ? "info" : "muted"}>{u.aiEnabled ? "Bật" : "Tắt"}</Badge>,
          },
        ]
      : []),
    { id: "leads", header: "Lead đang giữ", align: "right", sortValue: (u) => u.assignedLeadCount, cell: (u) => <span className="tabular-nums">{u.assignedLeadCount}</span> },
    {
      id: "active",
      header: "Trạng thái",
      sortValue: (u) => u.active,
      cell: (u) => <Badge variant={u.active ? "success" : "muted"}>{u.active ? "Đang hoạt động" : "Đã ngừng"}</Badge>,
    },
  ];

  const getPartnerProjectIds = React.useCallback(
    (partnerId: string | null) => {
      if (!partnerId) return [];
      const found = partners.find((p) => p.id === partnerId);
      return found?.projectIds ?? [];
    },
    [partners],
  );

  const openCreate = (targetRole?: "PARTNER_ADMIN" | "STAFF") => {
    const nextRole = isSuper ? (targetRole ?? tab) : "STAFF";
    const defaultPartnerId = nextRole === "STAFF" ? (partners[0]?.id ?? null) : null;
    const defaultPartnerProjs = nextRole === "STAFF" && isSuper ? getPartnerProjectIds(defaultPartnerId) : [];
    const defaultProjectIds =
      defaultPartnerProjs.length > 0
        ? defaultPartnerProjs
        : projects[0]?.id
          ? [projects[0].id]
          : [];
    setEditing(null);
    setCreating(true);
    setForm({
      ...EMPTY_FORM,
      role: nextRole,
      partnerId: defaultPartnerId,
      projectIds: defaultProjectIds,
    });
  };

  const openEdit = (user: ManagedUser) => {
    setCreating(false);
    setEditing(user);
    const nextForm = toForm(user, isSuper);
    if (nextForm.role === "PARTNER_ADMIN" && nextForm.projectIds.length > 0) {
      const allowedPageSet = new Set(
        pages
          .filter((p) => Boolean(p.projectId && nextForm.projectIds.includes(p.projectId)))
          .map((p) => p.value),
      );
      nextForm.pageIds = nextForm.pageIds.filter((id) => allowedPageSet.has(id));
    }
    setForm(nextForm);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
  };

  /** Server báo kết quả gửi email đặt mật khẩu bằng một câu; câu bắt đầu "Không gửi" là cảnh báo. */
  const announceMailNotice = (notice: string) => {
    if (notice.startsWith("Không gửi")) toast.warning("Chưa gửi được email đặt mật khẩu", notice);
    else toast.success(notice);
  };

  const submit = async () => {
    if (!form.fullName.trim()) return;
    setPending(true);
    const payload = {
      fullName: form.fullName,
      email: form.email,
      role: form.role,
      active: form.active,
      aiEnabled: form.role === "PARTNER_ADMIN" ? form.aiEnabled : false,
      partnerId: form.role === "STAFF" ? form.partnerId : null,
      projectId: form.projectIds[0] ?? null,
      projectIds: form.projectIds,
      pageIds: form.role === "PARTNER_ADMIN" ? form.pageIds : [],
    };
    const result = editing
      ? await updateUserAction({ id: editing.id, ...payload })
      : await createUserAction(payload);
    setPending(false);
    if (!result.ok) {
      toast.error(editing ? "Không cập nhật được tài khoản" : "Không tạo được tài khoản", result.error);
      return;
    }
    toast.success(editing ? "Đã cập nhật tài khoản." : "Đã tạo tài khoản.");
    if (result.notice) announceMailNotice(result.notice);
    if (isSuper && form.role !== tab) {
      setTab(form.role);
    }
    close();
    router.refresh();
  };

  const resendMail = async () => {
    if (!editing) return;
    setPending(true);
    const result = await resendPasswordEmailAction(editing.id);
    setPending(false);
    if (!result.ok) {
      toast.error("Không gửi được email", result.error);
      return;
    }
    announceMailNotice(result.notice);
  };

  const dialogOpen = creating || Boolean(editing);

  const projectMultiOptions = React.useMemo(
    () => projects.map((p) => ({ value: p.id, label: p.name })),
    [projects],
  );

  const staffProjectOptions = React.useMemo(() => {
    if (!isSuper) return projectMultiOptions;
    const allowedIds = getPartnerProjectIds(form.partnerId);
    return projectMultiOptions.filter((opt) => allowedIds.includes(opt.value));
  }, [isSuper, projectMultiOptions, getPartnerProjectIds, form.partnerId]);

  const availablePageOptions = React.useMemo(() => {
    if (form.projectIds.length === 0) return [];
    return pages
      .filter((p) => Boolean(p.projectId && form.projectIds.includes(p.projectId)))
      .map((p) => {
        const projName = p.projectId ? projectNameById.get(p.projectId) : null;
        return {
          value: p.value,
          label: projName && form.projectIds.length > 1 ? `${p.label} (${projName})` : p.label,
        };
      });
  }, [pages, form.projectIds, projectNameById]);

  return (
    <div className="space-y-3.5 p-3 sm:space-y-4 sm:p-4">
      <div>
        <h1 className="text-xl font-bold max-md:hidden">{!isSuper ? "Nhân viên" : "Tài khoản"}</h1>
        <p className="text-[13px] text-muted-foreground">
          {!isSuper
            ? "Nhân viên của bạn xuất hiện trong ô phụ trách trên màn lead."
            : "Partner admin gắn theo dự án và fanpage. Nhân viên thuộc một partner và chỉ sửa lead được giao."}
        </p>
      </div>

      <ListPanel
        toolbar={
          <ListToolbar
            tabs={
              isSuper && (
                <CountTabs
                  value={tab}
                  onChange={(next) => {
                    setTab(next);
                    setPartnerFilter("all");
                  }}
                  tabs={[
                    { id: "PARTNER_ADMIN", label: "Partner admin", count: countByRole("PARTNER_ADMIN") },
                    { id: "STAFF", label: "Nhân viên", count: countByRole("STAFF") },
                  ]}
                />
              )
            }
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / email / dự án" }}
            filters={
              <>
                {projects.length > 0 && (
                  <FilterSelect
                    value={projectFilter}
                    onChange={setProjectFilter}
                    options={[
                      { value: "all", label: "Mọi dự án" },
                      ...projects.map((p) => ({ value: p.id, label: p.name })),
                    ]}
                  />
                )}
                <FilterSelect
                  value={statusFilter}
                  onChange={setStatusFilter}
                  options={[
                    { value: "all", label: "Mọi trạng thái" },
                    { value: "active", label: "Đang hoạt động" },
                    { value: "inactive", label: "Đã ngừng" },
                  ]}
                />
                {showPartnerColumn && (
                  <FilterSelect
                    value={partnerFilter}
                    onChange={setPartnerFilter}
                    options={[{ value: "all", label: "Mọi partner" }, ...partners.map((p) => ({ value: p.id, label: p.name }))]}
                  />
                )}
              </>
            }
            actions={
              isSuper ? (
                <div className="flex flex-wrap items-center gap-2">
                  <Button
                    size="sm"
                    variant={tab === "STAFF" ? "default" : "outline"}
                    className="gap-1.5"
                    onClick={() => openCreate("STAFF")}
                  >
                    <Plus className="size-3.5" />
                    Thêm nhân viên
                  </Button>
                  <Button
                    size="sm"
                    variant={tab === "PARTNER_ADMIN" ? "default" : "outline"}
                    className="gap-1.5"
                    onClick={() => openCreate("PARTNER_ADMIN")}
                  >
                    <Plus className="size-3.5" />
                    Thêm partner admin
                  </Button>
                </div>
              ) : (
                <Button size="sm" className="gap-1.5" onClick={() => openCreate("STAFF")}>
                  <Plus className="size-3.5" />
                  Thêm nhân viên
                </Button>
              )
            }
          />
        }
      >
        <DataTable
          key={tab}
          columns={columns}
          rows={visible}
          getRowKey={(u) => u.id}
          onRowClick={openEdit}
          unit="tài khoản"
          defaultSort={{ columnId: "name", order: "asc" }}
          emptyMessage="Không có tài khoản nào khớp bộ lọc hiện tại."
        />
      </ListPanel>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && close()}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editing ? "Sửa tài khoản" : form.role === "PARTNER_ADMIN" ? "Thêm partner admin" : "Thêm nhân viên"}</DialogTitle>
            <DialogDescription>
              {form.role === "PARTNER_ADMIN"
                ? "Chưa gán fanpage thì tài khoản này vào sẽ chỉ thấy lead thủ công thuộc dự án."
                : "Nhân viên kế thừa dự án và fanpage từ Partner admin quản lý mình."}
            </DialogDescription>
          </DialogHeader>

          <form
            className="space-y-4"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <div className="space-y-3">
              {isSuper && !editing && (
                <Field label="Vai trò">
                  <Select
                    value={form.role}
                    onValueChange={(value) => {
                      const nextRole = value as "PARTNER_ADMIN" | "STAFF";
                      const nextPartnerId = nextRole === "STAFF" ? (form.partnerId ?? partners[0]?.id ?? null) : null;
                      const partnerProjs = nextRole === "STAFF" ? getPartnerProjectIds(nextPartnerId) : [];
                      setForm((f) => ({
                        ...f,
                        role: nextRole,
                        partnerId: nextPartnerId,
                        projectIds:
                          nextRole === "STAFF"
                            ? partnerProjs
                            : f.projectIds.length === 0 && projects[0]?.id
                              ? [projects[0].id]
                              : f.projectIds,
                      }));
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Chọn vai trò" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="PARTNER_ADMIN">{ROLE_LABELS.PARTNER_ADMIN}</SelectItem>
                      <SelectItem value="STAFF">{ROLE_LABELS.STAFF}</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              )}
              <Field label="Họ tên">
                <Input
                  value={form.fullName}
                  onChange={(event) => setForm((f) => ({ ...f, fullName: event.target.value }))}
                  required
                />
              </Field>
              <Field label="Email đăng nhập">
                <Input
                  type="email"
                  value={form.email}
                  onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
                />
              </Field>
              {form.role === "STAFF" && isSuper && (
                <Field label="Thuộc partner">
                  {partners.length === 0 ? (
                    <div className="rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                      Cần tạo tài khoản Partner admin và gán dự án trước khi tạo nhân viên.
                    </div>
                  ) : (
                    <Select
                      value={form.partnerId ?? ""}
                      onValueChange={(value) => {
                        const partnerProjs = getPartnerProjectIds(value);
                        setForm((f) => ({
                          ...f,
                          partnerId: value,
                          projectIds: partnerProjs,
                        }));
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Chọn partner admin" />
                      </SelectTrigger>
                      <SelectContent>
                        {partners.map((partner) => (
                          <SelectItem key={partner.id} value={partner.id}>
                            {partner.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                </Field>
              )}
              {form.role === "STAFF" && (
                <Field label="Dự án phụ trách (thuộc Partner)">
                  {staffProjectOptions.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Partner admin này chưa được gán dự án nào. Hãy gán dự án cho Partner admin trước.
                    </div>
                  ) : (
                    <MultiSelect
                      options={staffProjectOptions}
                      selected={form.projectIds}
                      onChange={(projectIds) => setForm((f) => ({ ...f, projectIds }))}
                      placeholder="Chọn dự án thuộc Partner…"
                      searchable={staffProjectOptions.length > 5}
                    />
                  )}
                </Field>
              )}
              {form.role === "PARTNER_ADMIN" && isSuper && (
                <Field label="Dự án quản trị">
                  <MultiSelect
                    options={projectMultiOptions}
                    selected={form.projectIds}
                    onChange={(projectIds) => {
                      const allowedPageSet = new Set(
                        pages
                          .filter((p) => Boolean(p.projectId && projectIds.includes(p.projectId)))
                          .map((p) => p.value),
                      );
                      setForm((f) => ({
                        ...f,
                        projectIds,
                        pageIds: f.pageIds.filter((id) => allowedPageSet.has(id)),
                      }));
                    }}
                    placeholder="Chọn dự án…"
                    searchable={projects.length > 5}
                  />
                </Field>
              )}
              {form.role === "PARTNER_ADMIN" && (
                <Field label="Fanpage (thuộc dự án đã chọn)">
                  {form.projectIds.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Hãy chọn Dự án quản trị trước để hiển thị danh sách Fanpage của dự án đó.
                    </div>
                  ) : availablePageOptions.length === 0 ? (
                    <div className="rounded-md border border-border bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
                      Dự án đã chọn chưa có Fanpage nào (vào menu Dự án → chi tiết → Fanpage để gán).
                    </div>
                  ) : (
                    <MultiSelect
                      options={availablePageOptions}
                      selected={form.pageIds.filter((id) =>
                        availablePageOptions.some((opt) => opt.value === id),
                      )}
                      onChange={(pageIds) => setForm((f) => ({ ...f, pageIds }))}
                      placeholder="Chọn fanpage thuộc dự án…"
                      searchable={availablePageOptions.length > 6}
                    />
                  )}
                </Field>
              )}
              {form.role === "PARTNER_ADMIN" && isSuper && (
                <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                  <div>
                    <div className="text-sm font-medium">Trợ lý AI</div>
                    <div className="text-[12px] text-muted-foreground">Chỉ super admin bật được quyền này.</div>
                  </div>
                  <Switch checked={form.aiEnabled} onCheckedChange={(aiEnabled) => setForm((f) => ({ ...f, aiEnabled }))} />
                </div>
              )}
              <div className="flex items-center justify-between rounded-lg border border-border px-3 py-2">
                <div>
                  <div className="text-sm font-medium">Đang hoạt động</div>
                  <div className="text-[12px] text-muted-foreground">Tắt để thu hồi đăng nhập. Lead đã giao vẫn giữ tên.</div>
                </div>
                <Switch
                  checked={form.active}
                  onCheckedChange={(active) => setForm((f) => ({ ...f, active }))}
                  disabled={editing?.id === currentUserId}
                />
              </div>
              {editing?.email && (
                <Button type="button" variant="outline" onClick={() => void resendMail()} disabled={pending}>
                  Gửi lại email đặt mật khẩu
                </Button>
              )}
            </div>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={close} disabled={pending}>
                Hủy
              </Button>
              <Button
                type="submit"
                disabled={
                  pending ||
                  !form.fullName.trim() ||
                  (form.role === "STAFF" && isSuper && !form.partnerId) ||
                  form.projectIds.length === 0
                }
              >
                {pending ? "Đang lưu…" : "Lưu"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
