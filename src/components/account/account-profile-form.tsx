"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";

import { updateOwnProfileAction } from "@/app/account/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

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
  const [name, setName] = React.useState(fullName);
  const [pending, setPending] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [info, setInfo] = React.useState<string | null>(null);

  const dirty = name.trim() !== fullName.trim();

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canEdit) return;
    setPending(true);
    setError(null);
    setInfo(null);
    const result = await updateOwnProfileAction({ fullName: name });
    setPending(false);
    if (!result.ok) {
      setError(result.error);
      return;
    }
    setInfo("Đã lưu hồ sơ.");
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
            setInfo(null);
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

      {error && <p className="text-[12px] text-rose-600">{error}</p>}
      {info && <p className="text-[12px] text-emerald-700">{info}</p>}

      {canEdit && (
        <Button type="submit" disabled={pending || !dirty || !name.trim()}>
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Lưu thay đổi"}
        </Button>
      )}
    </form>
  );
}
