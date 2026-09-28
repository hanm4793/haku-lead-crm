"use client";

import * as React from "react";
import { Plus, Search, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { createUserAction, resendPasswordEmailAction, updateUserAction } from "@/app/users/actions";
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
import { cn } from "@/lib/utils";

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
  const [users, setUsers] = React.useState(initialUsers);
  const [query, setQuery] = React.useState("");
  const [tab, setTab] = React.useState<"PARTNER_ADMIN" | "STAFF">(
    actorRole === "PARTNER_ADMIN" ? "STAFF" : "PARTNER_ADMIN",
  );
  const [editing, setEditing] = React.useState<ManagedUser | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [error, setError] = React.useState<string | null>(null);
  const [notice, setNotice] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const visible = users.filter((user) => {
    if (actorRole === "SUPER_ADMIN" && user.role !== tab) return false;
    if (actorRole === "SUPER_ADMIN" && user.role === "SUPER_ADMIN") return false;
    const haystack = `${user.fullName} ${user.email ?? ""} ${user.partnerName ?? ""}`.toLowerCase();
    return haystack.includes(query.trim().toLowerCase());
  });

  const openCreate = () => {
    setEditing(null);
    setCreating(true);
    setForm({
      ...EMPTY_FORM,
      role: tab === "PARTNER_ADMIN" ? "PARTNER_ADMIN" : "STAFF",
      projectId: projects[0]?.id ?? null,
    });
    setError(null);
  };

  const openEdit = (user: ManagedUser) => {
    setCreating(false);
    setEditing(user);
    setForm(toForm(user, actorRole));
    setError(null);
  };

  const close = () => {
    setCreating(false);
    setEditing(null);
    setError(null);
  };

  const submit = async () => {
    setPending(true);
    setError(null);
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
      setError(result.error);
      return;
    }
    setNotice(result.notice ?? null);
    close();
    router.refresh();
  };

  const resendMail = async () => {
    if (!editing) return;
    setPending(true);
    setError(null);
    const result = await resendPasswordEmailAction(editing.id);
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setNotice(result.notice);
  };

  const dialogOpen = creating || Boolean(editing);

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{actorRole === "PARTNER_ADMIN" ? "Nhân viên" : "Tài khoản"}</h1>
          <p className="text-[13px] text-muted-foreground">
            {actorRole === "PARTNER_ADMIN"
              ? "Nhân viên của bạn xuất hiện trong ô phụ trách trên màn lead."
              : "Partner admin gắn theo fanpage. Nhân viên thuộc một partner và chỉ sửa lead được giao."}
          </p>
        </div>
        <Button size="sm" className="gap-2" onClick={openCreate}>
          <Plus className="size-3.5" />
          {tab === "PARTNER_ADMIN" ? "Thêm partner admin" : "Thêm nhân viên"}
        </Button>
      </div>

      {actorRole === "SUPER_ADMIN" && (
        <div className="flex gap-2">
          <Button
            size="sm"
            variant={tab === "PARTNER_ADMIN" ? "default" : "outline"}
            onClick={() => setTab("PARTNER_ADMIN")}
          >
            Partner admin
          </Button>
          <Button size="sm" variant={tab === "STAFF" ? "default" : "outline"} onClick={() => setTab("STAFF")}>
            Nhân viên
          </Button>
        </div>
      )}

      {notice && (
        <p
          className={cn(
            "rounded-lg border px-3 py-2 text-[13px]",
            notice.startsWith("Không gửi")
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-emerald-200 bg-emerald-50 text-emerald-800",
          )}
        >
          {notice}
        </p>
      )}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Tìm tên hoặc email"
          className="h-8 pl-8 text-[13px]"
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-card">
        <table className="w-full text-left text-[13px]">
          <thead className="border-b border-border bg-muted/40 text-[11px] uppercase tracking-wide text-muted-foreground">
            <tr>
              <th className="px-3 py-2 font-medium">Tên</th>
              <th className="px-3 py-2 font-medium">Email</th>
              {tab === "STAFF" && actorRole === "SUPER_ADMIN" && <th className="px-3 py-2 font-medium">Partner</th>}
              {tab === "PARTNER_ADMIN" && <th className="px-3 py-2 font-medium">Fanpage</th>}
              {tab === "PARTNER_ADMIN" && <th className="px-3 py-2 font-medium">AI</th>}
              <th className="px-3 py-2 font-medium">Lead đang giữ</th>
              <th className="px-3 py-2 font-medium">Trạng thái</th>
            </tr>
          </thead>
          <tbody>
            {visible.length === 0 && (
              <tr>
                <td colSpan={6} className="px-3 py-10 text-center text-muted-foreground">
                  Chưa có tài khoản nào.
                </td>
              </tr>
            )}
            {visible.map((user) => (
              <tr
                key={user.id}
                onClick={() => openEdit(user)}
                className="cursor-pointer border-b border-border/70 last:border-0 hover:bg-muted/30"
              >
                <td className="px-3 py-2 font-medium">
                  <span className="inline-flex items-center gap-1.5">
                    {user.role === "PARTNER_ADMIN" && <Shield className="size-3.5 text-primary" />}
                    {user.fullName}
                    {user.id === currentUserId && <span className="text-[11px] text-muted-foreground">(bạn)</span>}
                  </span>
                </td>
                <td className="px-3 py-2 text-muted-foreground">{user.email ?? "Chưa có email"}</td>
                {tab === "STAFF" && actorRole === "SUPER_ADMIN" && (
                  <td className="px-3 py-2">{user.partnerName ?? "—"}</td>
                )}
                {tab === "PARTNER_ADMIN" && (
                  <td className="px-3 py-2">{user.pageIds.length === 0 ? "Chưa gán page" : `${user.pageIds.length} page`}</td>
                )}
                {tab === "PARTNER_ADMIN" && (
                  <td className="px-3 py-2">{user.aiEnabled ? "Bật" : "Tắt"}</td>
                )}
                <td className="px-3 py-2 tabular-nums">{user.assignedLeadCount}</td>
                <td className="px-3 py-2">
                  <Badge variant={user.active ? "default" : "outline"} className={cn(!user.active && "text-muted-foreground")}>
                    {user.active ? "Đang hoạt động" : "Đã ngừng"}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
            {error && <p className="text-[13px] text-rose-600">{error}</p>}
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
