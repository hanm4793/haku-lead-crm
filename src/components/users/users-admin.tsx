"use client";

import * as React from "react";
import { Plus, Search, Shield } from "lucide-react";
import { useRouter } from "next/navigation";

import { createUserAction, updateUserAction } from "@/app/users/actions";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { ROLE_HINTS, ROLE_LABELS, USER_ROLES, type UserRole } from "@/lib/auth/roles";
import type { ManagedUser, ShowroomOption } from "@/lib/db/users-repo";
import { cn } from "@/lib/utils";

type FormState = {
  fullName: string;
  email: string;
  role: UserRole;
  showroomId: string | null;
  active: boolean;
};

const EMPTY_FORM: FormState = {
  fullName: "",
  email: "",
  role: "SALES",
  showroomId: null,
  active: true,
};

function toForm(user: ManagedUser | null): FormState {
  if (!user) return EMPTY_FORM;
  return {
    fullName: user.fullName,
    email: user.email ?? "",
    role: user.role,
    showroomId: user.showroomId,
    active: user.active,
  };
}

export function UsersAdmin({
  initialUsers,
  showrooms,
  currentUserId,
}: {
  initialUsers: ManagedUser[];
  showrooms: ShowroomOption[];
  currentUserId: string | null;
}) {
  const router = useRouter();
  const [users, setUsers] = React.useState(initialUsers);
  const [query, setQuery] = React.useState("");
  const [editing, setEditing] = React.useState<ManagedUser | null>(null);
  const [creating, setCreating] = React.useState(false);
  const [form, setForm] = React.useState<FormState>(EMPTY_FORM);
  const [error, setError] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  React.useEffect(() => {
    setUsers(initialUsers);
  }, [initialUsers]);

  const openCreate = () => {
    setCreating(true);
    setEditing(null);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const openEdit = (user: ManagedUser) => {
    setCreating(false);
    setEditing(user);
    setForm(toForm(user));
    setError(null);
  };

  const closeDialog = (force = false) => {
    if (pending && !force) return;
    setCreating(false);
    setEditing(null);
    setError(null);
  };

  const filtered = users.filter((user) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return (
      user.fullName.toLowerCase().includes(q) ||
      (user.email?.toLowerCase().includes(q) ?? false) ||
      ROLE_LABELS[user.role].toLowerCase().includes(q) ||
      (user.showroomName?.toLowerCase().includes(q) ?? false)
    );
  });

  const save = async () => {
    setPending(true);
    setError(null);
    const payload = {
      fullName: form.fullName,
      email: form.email.trim() || null,
      role: form.role,
      showroomId: form.showroomId,
      active: form.active,
    };

    const result = creating
      ? await createUserAction(payload)
      : await updateUserAction({ id: editing!.id, ...payload });

    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }

    setUsers((prev) => {
      const idx = prev.findIndex((u) => u.id === result.user.id);
      if (idx === -1) return [...prev, result.user].sort((a, b) => a.fullName.localeCompare(b.fullName, "vi"));
      const next = [...prev];
      next[idx] = result.user;
      return next;
    });
    closeDialog(true);
    router.refresh();
  };

  const dialogOpen = creating || editing !== null;

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Tài khoản &amp; phân quyền</h1>
          <p className="text-[13px] text-muted-foreground">
            Gán vai trò, showroom và email để nhân sự đăng nhập khớp đúng hồ sơ.
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="size-4" />
          Thêm nhân sự
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-border bg-card px-3 py-2">
        <Search className="size-4 text-muted-foreground" />
        <Input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Tìm theo tên, email, vai trò, showroom…"
          className="h-8 border-0 shadow-none focus-visible:ring-0"
        />
        <Badge variant="muted">{filtered.length} / {users.length}</Badge>
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-card">
        <div className="thin-scrollbar overflow-auto">
          <table className="w-full min-w-[860px] border-collapse text-[13px]">
            <thead className="bg-secondary/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              <tr>
                <th className="px-3 py-2 font-semibold">Nhân sự</th>
                <th className="px-3 py-2 font-semibold">Vai trò</th>
                <th className="px-3 py-2 font-semibold">Showroom</th>
                <th className="px-3 py-2 font-semibold">Đăng nhập</th>
                <th className="px-3 py-2 font-semibold">Lead</th>
                <th className="px-3 py-2 font-semibold">Trạng thái</th>
                <th className="px-3 py-2 font-semibold" />
              </tr>
            </thead>
            <tbody>
              {filtered.map((user) => {
                const isSelf = currentUserId === user.id;
                return (
                  <tr key={user.id} className="border-t border-border hover:bg-secondary/40">
                    <td className="px-3 py-2.5">
                      <div className="font-medium text-slate-800">
                        {user.fullName}
                        {isSelf && (
                          <span className="ml-1.5 text-[11px] font-normal text-muted-foreground">(bạn)</span>
                        )}
                      </div>
                      <div className="text-[12px] text-muted-foreground">{user.email ?? "Chưa gán email"}</div>
                    </td>
                    <td className="px-3 py-2.5">
                      <Badge variant={user.role === "ADMIN" ? "default" : "outline"}>
                        {user.role === "ADMIN" && <Shield className="mr-1 size-3" />}
                        {ROLE_LABELS[user.role]}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-slate-700">{user.showroomName ?? "—"}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={user.hasAuth ? "success" : "warning"}>
                        {user.hasAuth ? "Đã liên kết" : "Chưa đăng nhập"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 tabular-nums">{user.assignedLeadCount}</td>
                    <td className="px-3 py-2.5">
                      <Badge variant={user.active ? "success" : "muted"}>
                        {user.active ? "Hoạt động" : "Tắt"}
                      </Badge>
                    </td>
                    <td className="px-3 py-2.5 text-right">
                      <Button variant="outline" size="sm" onClick={() => openEdit(user)}>
                        Sửa
                      </Button>
                    </td>
                  </tr>
                );
              })}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={7} className="px-3 py-10 text-center text-muted-foreground">
                    Không có nhân sự khớp bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={dialogOpen} onOpenChange={(open) => !open && closeDialog()}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{creating ? "Thêm nhân sự" : "Cập nhật tài khoản"}</DialogTitle>
            <DialogDescription>
              Gán email trùng với tài khoản Supabase để lần đăng nhập đầu gắn đúng hồ sơ và quyền.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3">
            <Field label="Họ tên">
              <Input
                value={form.fullName}
                onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))}
                placeholder="Nguyễn Văn A"
              />
            </Field>
            <Field label="Email đăng nhập">
              <Input
                type="email"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="ten@thaco.com.vn"
              />
            </Field>
            <Field label="Vai trò">
              <Select
                value={form.role}
                onValueChange={(value) => setForm((f) => ({ ...f, role: value as UserRole }))}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {USER_ROLES.map((role) => (
                    <SelectItem key={role} value={role}>
                      {ROLE_LABELS[role]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[12px] text-muted-foreground">{ROLE_HINTS[form.role]}</p>
            </Field>
            <Field label="Showroom">
              <Select
                value={form.showroomId ?? "__none__"}
                onValueChange={(value) =>
                  setForm((f) => ({ ...f, showroomId: value === "__none__" ? null : value }))
                }
              >
                <SelectTrigger>
                  <SelectValue placeholder="Chọn showroom" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">Không gán</SelectItem>
                  {showrooms.map((room) => (
                    <SelectItem key={room.id} value={room.id}>
                      {room.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {form.role === "SHOWROOM_MANAGER" && (
                <p className="text-[12px] text-amber-700">Bắt buộc với Quản lý showroom.</p>
              )}
            </Field>
            <div className="flex items-center justify-between rounded-md border border-border px-3 py-2">
              <div>
                <div className="text-sm font-medium">Đang hoạt động</div>
                <div className="text-[12px] text-muted-foreground">Tắt thì không đăng nhập được CRM.</div>
              </div>
              <Switch
                checked={form.active}
                onCheckedChange={(checked) => setForm((f) => ({ ...f, active: checked }))}
                disabled={editing !== null && currentUserId === editing.id}
              />
            </div>
            {error && (
              <p className={cn("rounded-md bg-red-50 px-3 py-2 text-[13px] text-red-700")}>{error}</p>
            )}
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => closeDialog()} disabled={pending}>
              Hủy
            </Button>
            <Button onClick={save} disabled={pending || !form.fullName.trim()}>
              {pending ? "Đang lưu…" : creating ? "Tạo" : "Lưu"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
    </div>
  );
}
