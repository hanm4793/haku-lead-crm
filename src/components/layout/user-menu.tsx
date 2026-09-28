"use client";

import * as React from "react";
import { KeyRound, Loader2, LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
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
import { createSupabaseBrowserClient } from "@/lib/supabase/browser";
import { cn } from "@/lib/utils";

export function UserMenu({
  fullName,
  role,
  isDemo,
  collapsed,
}: {
  fullName: string;
  role: string;
  isDemo: boolean;
  collapsed: boolean;
}) {
  const [passwordOpen, setPasswordOpen] = React.useState(false);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [passwordError, setPasswordError] = React.useState<string | null>(null);
  const [passwordInfo, setPasswordInfo] = React.useState<string | null>(null);
  const [pending, setPending] = React.useState(false);

  const initials = fullName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase() ?? "")
    .join("") || "?";

  return (
    <div className={cn("border-t border-sidebar-border px-3 py-3", collapsed && "px-0")}>
      <div className={cn("flex items-center gap-2", collapsed && "justify-center")}>
        <div className="flex size-7 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
          {initials}
        </div>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <div className="truncate text-xs font-medium">{fullName}</div>
            <div className="truncate text-[10px] text-white/60">
              {isDemo ? "Demo" : role}
            </div>
          </div>
        )}
      </div>
      {!isDemo && (
        <div className={cn("mt-2 space-y-1", collapsed && "flex flex-col items-center")}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            title="Đổi mật khẩu"
            className={cn(
              "h-7 gap-1.5 px-2 text-white/70 hover:bg-white/10 hover:text-white",
              collapsed ? "w-8 justify-center" : "w-full justify-start",
            )}
            onClick={() => {
              setPassword("");
              setConfirm("");
              setPasswordError(null);
              setPasswordInfo(null);
              setPasswordOpen(true);
            }}
          >
            <KeyRound className="size-3.5" />
            {!collapsed && <span className="text-[11px]">Đổi mật khẩu</span>}
          </Button>
          <ChangePasswordDialog
            open={passwordOpen}
            password={password}
            confirm={confirm}
            error={passwordError}
            info={passwordInfo}
            pending={pending}
            onOpenChange={setPasswordOpen}
            onPasswordChange={setPassword}
            onConfirmChange={setConfirm}
            onSubmit={async () => {
              setPasswordError(null);
              setPasswordInfo(null);
              if (password.length < 6) {
                setPasswordError("Mật khẩu tối thiểu 6 ký tự.");
                return;
              }
              if (password !== confirm) {
                setPasswordError("Mật khẩu nhập lại không khớp.");
                return;
              }
              setPending(true);
              const supabase = createSupabaseBrowserClient();
              const { error } = await supabase.auth.updateUser({ password });
              setPending(false);
              if (error) {
                setPasswordError(error.message);
                return;
              }
              setPasswordInfo("Đã đổi mật khẩu.");
              setPassword("");
              setConfirm("");
            }}
          />
        <form action={signOut} className={cn(collapsed && "flex justify-center")}>
          <Button
            type="submit"
            variant="ghost"
            size="sm"
            title="Đăng xuất"
            className={cn(
              "h-7 gap-1.5 px-2 text-white/70 hover:bg-white/10 hover:text-white",
              collapsed ? "w-8 justify-center" : "w-full justify-start",
            )}
          >
            <LogOut className="size-3.5" />
            {!collapsed && <span className="text-[11px]">Đăng xuất</span>}
          </Button>
        </form>
        </div>
      )}
    </div>
  );
}

function ChangePasswordDialog({
  open,
  password,
  confirm,
  error,
  info,
  pending,
  onOpenChange,
  onPasswordChange,
  onConfirmChange,
  onSubmit,
}: {
  open: boolean;
  password: string;
  confirm: string;
  error: string | null;
  info: string | null;
  pending: boolean;
  onOpenChange: (open: boolean) => void;
  onPasswordChange: (value: string) => void;
  onConfirmChange: (value: string) => void;
  onSubmit: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>Đổi mật khẩu</DialogTitle>
          <DialogDescription>Mật khẩu mới có hiệu lực từ lần đăng nhập sau.</DialogDescription>
        </DialogHeader>
        <form
          className="space-y-3"
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit();
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="new-password">Mật khẩu mới</Label>
            <Input
              id="new-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={password}
              onChange={(event) => onPasswordChange(event.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="confirm-password">Nhập lại mật khẩu</Label>
            <Input
              id="confirm-password"
              type="password"
              autoComplete="new-password"
              minLength={6}
              value={confirm}
              onChange={(event) => onConfirmChange(event.target.value)}
            />
          </div>
          {error && <p className="text-[12px] text-rose-600">{error}</p>}
          {info && <p className="text-[12px] text-emerald-700">{info}</p>}
          <DialogFooter>
            <Button type="submit" disabled={pending}>
              {pending ? <Loader2 className="size-4 animate-spin" /> : "Lưu mật khẩu"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
