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
import { ROLE_LABELS, type UserRole } from "@/lib/auth/roles";
import type { ManagedUser } from "@/lib/db/users-repo";
import { useToast } from "@/components/providers/toast-provider";

type PageOption = { value: string; label: string };
type PartnerOption = { id: string; name: string };
type ProjectOption = { id: string; name: string };

type FormState = {
  fullName: string;
  email: string;
  role: "PARTNER_ADMIN" | "STAFF";
  partnerId: string | null;
  projectId: string | null;
  pageIds: string[];
  aiEnabled: boolean;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  role: "STAFF",
  partnerId: null,
  projectId: null,
  pageIds: [],
  aiEnabled: false,
  active: true,
};

function toForm(user: ManagedUser | null, actorRole: UserRole): FormState {
  if (!user) {
    return { ...EMPTY_FORM, role: actorRole === "PARTNER_ADMIN" ? "STAFF" : "PARTNER_ADMIN" };
  }
  return {
    fullName: user.fullName,
    email: user.email ?? "",
    role: user.role === "PARTNER_ADMIN" ? "PARTNER_ADMIN" : "STAFF",
    partnerId: user.partnerId,
    projectId: null,
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
  const [users, setUsers] = React.useState(initialUsers);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"PARTNER_ADMIN" | "STAFF">(
    actorRole === "PARTNER_ADMIN" ? "STAFF" : "PARTNER_ADMIN",
  );
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

  const isSuper = actorRole === "SUPER_ADMIN";
  const visible = users.filter((user) => {
    if (isSuper && user.role !== tab) return false;
    if (isSuper && user.role === "SUPER_ADMIN") return false;
    if (statusFilter !== "all" && user.active !== (statusFilter === "active")) return false;
    if (isSuper && tab === "STAFF" && partnerFilter !== "all" && user.partnerId !== partnerFilter) return false;
    const haystack = `${user.fullName} ${user.email ?? ""} ${user.partnerName ?? ""}`.toLowerCase();
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
    ...(tab === "PARTNER_ADMIN"
      ? [
          {
            id: "pages",
            header: "Fanpage",
            sortValue: (u: ManagedUser) => u.pageIds.length,
            cell: (u: ManagedUser) => (u.pageIds.length === 0 ? <span className="text-slate-300">Chưa gán page</span> : `${u.pageIds.length} page`),
          },
          {
            id: "ai",
            header: "AI",
            sortValue: (u: ManagedUser) => u.aiEnabled,
            cell: (u: ManagedUser) => <Badge variant={u.aiEnabled ? "info" : "muted"}>{u.aiEnabled ? "Bật" : "Tắt"}</Badge>,
          },
        ]
      : []),
    { id: "leads", header: "Lead đang giữ", align: "right", sortValue: (u) => u.assignedLeadCount, cell: (u) => u.assignedLeadCount },
    {
      id: "active",
      header: "Trạng thái",
      sortValue: (u) => u.active,
      cell: (u) => <Badge variant={u.active ? "success" : "muted"}>{u.active ? "Đang hoạt động" : "Đã ngừng"}</Badge>,
    },
  ];

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({
      ...EMPTY_FORM,
      role: tab === "PARTNER_ADMIN" ? "PARTNER_ADMIN" : "STAFF",
      projectId: projects[0]?.id ?? null,
    });
  };

  const openEdit = (user: ManagedUser) => {
    setCreating(false);
    setEditing(user);
    setForm(toForm(user, actorRole));
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
    setPending(true);
    const payload = {
      fullName: form.fullName,
      email: form.email,
      role: form.role,
      active: form.active,
      aiEnabled: form.role === "PARTNER_ADMIN" ? form.aiEnabled : false,
      partnerId: form.role === "STAFF" ? form.partnerId : null,
      projectId: form.role === "PARTNER_ADMIN" ? form.projectId : null,
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

  return (
    <div className="space-y-4 p-4">
      <div>
        <h1 className="text-xl font-bold">{actorRole === "PARTNER_ADMIN" ? "Nhân viên" : "Tài khoản"}</h1>
        <p className="text-[13px] text-muted-foreground">
          {actorRole === "PARTNER_ADMIN"
            ? "Nhân viên của bạn xuất hiện trong ô phụ trách trên màn lead."
            : "Partner admin gắn theo fanpage. Nhân viên thuộc một partner và chỉ sửa lead được giao."}
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
            search={{ value: query, onChange: setQuery, placeholder: "Tìm tên / email" }}
            filters={
              <>
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
              <Button size="sm" className="gap-1.5" onClick={openCreate}>
                <Plus className="size-3.5" />
                {tab === "PARTNER_ADMIN" ? "Thêm partner admin" : "Thêm nhân viên"}
              </Button>
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
                ? "Chưa gán fanpage thì tài khoản này vào sẽ không thấy lead và marketing."
                : ROLE_LABELS.STAFF}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            <Field label="Họ tên">
              <Input value={form.fullName} onChange={(event) => setForm((f) => ({ ...f, fullName: event.target.value }))} />
            </Field>
            <Field label="Email đăng nhập">
              <Input
                type="email"
                value={form.email}
                onChange={(event) => setForm((f) => ({ ...f, email: event.target.value }))}
              />
            </Field>
            {form.role === "STAFF" && actorRole === "SUPER_ADMIN" && (
              <Field label="Thuộc partner">
                <Select
                  value={form.partnerId ?? ""}
                  onValueChange={(value) => setForm((f) => ({ ...f, partnerId: value }))}
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
              </Field>
            )}
            {form.role === "PARTNER_ADMIN" && actorRole === "SUPER_ADMIN" && (
              <Field label="Project">
                <Select
                  value={form.projectId ?? ""}
                  onValueChange={(value) => setForm((f) => ({ ...f, projectId: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Chọn project" />
                  </SelectTrigger>
                  <SelectContent>
                    {projects.map((project) => (
                      <SelectItem key={project.id} value={project.id}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )}
            {form.role === "PARTNER_ADMIN" && (
              <Field label="Fanpage">
                <MultiSelect
                  options={pages}
                  selected={form.pageIds}
                  onChange={(pageIds) => setForm((f) => ({ ...f, pageIds }))}
                  searchable={pages.length > 6}
                />
              </Field>
            )}
            {form.role === "PARTNER_ADMIN" && actorRole === "SUPER_ADMIN" && (
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
            <Button variant="outline" onClick={close} disabled={pending}>
              Hủy
            </Button>
            <Button onClick={() => void submit()} disabled={pending}>
              {pending ? "Đang lưu…" : "Lưu"}
            </Button>
          </DialogFooter>
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
