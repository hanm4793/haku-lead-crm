"use client";

import * as React from "react";
import Link from "next/link";
import { ChevronUp, KeyRound, LogOut, UserRound } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export function UserMenu({
  fullName,
  role,
  email,
  isDemo,
  collapsed,
}: {
  fullName: string;
  role: string;
  email?: string | null;
  isDemo: boolean;
  collapsed: boolean;
}) {
  const initials =
    fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  return (
    <div className={cn("border-t border-sidebar-border p-2", collapsed && "px-1.5")}>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            title={fullName}
            className={cn(
              "flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-left transition-colors",
              "text-sidebar-foreground hover:bg-white/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/30",
              collapsed && "justify-center px-0",
            )}
          >
            <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-white/20 text-[11px] font-semibold">
              {initials}
            </div>
            {!collapsed && (
              <>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-xs font-medium">{fullName}</div>
                  <div className="truncate text-[10px] text-white/60">
                    {isDemo ? "Demo" : role}
                  </div>
                </div>
                <ChevronUp className="size-3.5 shrink-0 text-white/50" />
              </>
            )}
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="top" align={collapsed ? "center" : "start"} className="w-56">
          <DropdownMenuLabel className="normal-case tracking-normal">
            <div className="truncate text-sm font-semibold text-foreground">{fullName}</div>
            <div className="truncate text-[11px] font-normal text-muted-foreground">
              {isDemo ? "Chế độ demo" : (email || role)}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link href="/account" className="gap-2">
              <UserRound className="size-4" />
              Tài khoản
            </Link>
          </DropdownMenuItem>
          {!isDemo && (
            <DropdownMenuItem asChild>
              <Link href="/account/password" className="gap-2">
                <KeyRound className="size-4" />
                Đổi mật khẩu
              </Link>
            </DropdownMenuItem>
          )}
          {!isDemo && (
            <>
              <DropdownMenuSeparator />
              <form action={signOut}>
                <DropdownMenuItem asChild>
                  <button type="submit" className="w-full cursor-pointer gap-2">
                    <LogOut className="size-4" />
                    Đăng xuất
                  </button>
                </DropdownMenuItem>
              </form>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
