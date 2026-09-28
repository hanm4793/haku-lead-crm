"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronLeft, Megaphone, Settings, Shield, Sparkles, Users } from "lucide-react";

import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { canSeeNav, canUseAi, ROLE_LABELS, type NavGate, type UserRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; icon: typeof Users; access: NavGate }[] = [
  { href: "/leads", label: "Lead", icon: Users, access: "all" },
  { href: "/reports", label: "Báo cáo", icon: BarChart3, access: "reports" },
  { href: "/marketing", label: "Marketing", icon: Megaphone, access: "marketing" },
  { href: "/users", label: "Tài khoản", icon: Shield, access: "users" },
  { href: "/settings", label: "Cài đặt App", icon: Settings, access: "settings" },
];

export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer?: {
    fullName: string;
    role: UserRole;
    isDemo: boolean;
    aiEnabled: boolean;
  } | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  if (pathname.startsWith("/login")) return <>{children}</>;

  const user = viewer ?? { fullName: "Chế độ demo", role: "SUPER_ADMIN" as const, isDemo: true, aiEnabled: true };
  const navItems = NAV_ITEMS.filter((item) => canSeeNav(user.role, item.access));
  const showAi = canUseAi(user);

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-[4.25rem]" : "w-60",
        )}
      >
        <div
          className={cn(
            "flex items-center gap-3 border-b border-white/10 px-4 py-4",
            collapsed && "justify-center px-2",
          )}
        >
          <Image
            src="/brand/logo-white.png"
            alt="SEMTOP"
            width={collapsed ? 36 : 120}
            height={collapsed ? 36 : 32}
            className={cn("object-contain", collapsed ? "h-8 w-8" : "h-8 w-auto")}
            priority
          />
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-[13px] font-bold tracking-tight">SEMTOP</div>
              <div className="truncate text-[10px] font-medium uppercase tracking-[0.08em] text-white/65">
                Marketing CRM
              </div>
            </div>
          )}
        </div>

        <nav className="mt-3 flex flex-1 flex-col gap-1 px-2.5">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors",
                  active
                    ? "bg-sidebar-accent text-white shadow-sm"
                    : "text-white/80 hover:bg-white/10 hover:text-white",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          {showAi && (
            <button
              type="button"
              onClick={() => setAiOpen(true)}
              title={collapsed ? "Trợ lý AI" : undefined}
              className={cn(
                "mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white",
                collapsed && "justify-center px-0",
              )}
            >
              <Sparkles className="size-4 shrink-0" />
              {!collapsed && <span className="truncate">Trợ lý AI</span>}
            </button>
          )}
        </nav>

        <div className="px-2.5 pb-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setCollapsed((v) => !v)}
            className={cn(
              "w-full justify-start gap-2 text-white/70 hover:bg-white/10 hover:text-white",
              collapsed && "justify-center",
            )}
          >
            <ChevronLeft className={cn("size-4 transition-transform", collapsed && "rotate-180")} />
            {!collapsed && <span className="text-xs">Thu gọn</span>}
          </Button>
        </div>

        <UserMenu
          fullName={user.fullName}
          role={ROLE_LABELS[user.role]}
          isDemo={user.isDemo}
          collapsed={collapsed}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">{children}</main>

        <footer className="flex items-center justify-between border-t border-border bg-card px-5 py-2.5 text-[11px] text-muted-foreground">
          <span>SEMTOP Marketing CRM</span>
          <div className="flex items-center gap-4">
            <span>{user.fullName}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Hệ thống hoạt động
            </span>
          </div>
        </footer>
      </div>

      {showAi && <AiChatPanel open={aiOpen} onOpenChange={setAiOpen} />}
    </div>
  );
}
