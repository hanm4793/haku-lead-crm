"use client";

import { LogOut } from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { Button } from "@/components/ui/button";
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
        <form action={signOut} className={cn("mt-2", collapsed && "flex justify-center")}>
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
      )}
    </div>
  );
}
