"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import { Loader2 } from "lucide-react";

import { updateOwnProfileAction } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/providers/toast-provider";

export function AccountProfileForm({
  fullName,
  email,
  roleLabel,
  canEdit,
}: {
  fullName: string;
  email: string | null;
  roleLabel: string;
  canEdit: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [name, setName] = React.useState(fullName);
  const [prevFullName, setPrevFullName] = React.useState(fullName);
  if (fullName !== prevFullName) {
    setPrevFullName(fullName);
    setName(fullName);
  }
  const [pending, setPending] = React.useState(false);

  const dirty = name.trim() !== fullName.trim();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setPending(true);
    const result = await updateOwnProfileAction({ fullName: name });
    setPending(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    toast.success("Đã lưu hồ sơ.");
    router.refresh();
  };

  return (
    <form className="space-y-4" onSubmit={save}>
      <div className="space-y-1.5">
        <Label htmlFor="fullName">Họ tên</Label>
        <Input
          id="fullName"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          disabled={!canEdit || pending}
          maxLength={120}
          required
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="email">Email</Label>
        <Input id="email" value={email ?? ""} disabled readOnly />
        <p className="text-[11px] text-muted-foreground">Email đăng nhập do quản trị viên quản lý, không tự đổi tại đây.</p>
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="role">Vai trò</Label>
        <Input id="role" value={roleLabel} disabled readOnly />
      </div>

      {canEdit && (
        <Button type="submit" disabled={pending || !dirty || !name.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Lưu thay đổi"}
        </Button>
      )}
    </form>
  );
}
