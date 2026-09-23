"use client";

import * as React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BarChart3, ChevronLeft, Megaphone, Settings, Shield, Sparkles, Users } from "lucide-react";

import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/leads", label: "Lead", icon: Users },
  { href: "/reports", label: "Báo cáo", icon: BarChart3 },
  { href: "/marketing", label: "Marketing", icon: Megaphone, adminOnly: true },
  { href: "/users", label: "Tài khoản", icon: Shield, adminOnly: true },
  { href: "/settings", label: "Cài đặt App", icon: Settings },
] as const;

export function AppShell({
  children,
  viewer,
}: {
  children: React.ReactNode;
  viewer?: {
    fullName: string;
    role: string;
    isDemo: boolean;
  } | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);

  // Trang đăng nhập đứng riêng, không bọc sidebar/footer.
  if (pathname.startsWith("/login")) return <>{children}</>;

  const user = viewer ?? { fullName: "Chế độ demo", role: "ADMIN", isDemo: true };
  const navItems = NAV_ITEMS.filter((item) => !("adminOnly" in item && item.adminOnly) || user.role === "ADMIN");

  return (
    <div className="flex min-h-screen">
      <aside
        className={cn(
          "sticky top-0 flex h-screen shrink-0 flex-col bg-sidebar text-sidebar-foreground transition-[width] duration-200",
          collapsed ? "w-16" : "w-56",
        )}
      >
        <div className={cn("flex items-center gap-2 px-4 py-4", collapsed && "justify-center px-2")}>
          <div className="flex size-8 shrink-0 items-center justify-center rounded bg-white/95 text-[10px] font-black tracking-tighter text-[#0b2f6b]">
            TA
          </div>
          {!collapsed && (
            <div className="min-w-0">
              <div className="truncate text-sm font-extrabold tracking-wide">THACO AUTO</div>
              <div className="truncate text-[10px] uppercase tracking-wider text-white/70">
                Thaco Auto Hà Nội
              </div>
            </div>
          )}
        </div>

        <nav className="mt-2 flex flex-1 flex-col gap-1 px-2">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                title={collapsed ? item.label : undefined}
                className={cn(
                  "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  active ? "bg-sidebar-accent text-white" : "text-white/80 hover:bg-white/10 hover:text-white",
                  collapsed && "justify-center px-0",
                )}
              >
                <Icon className="size-4 shrink-0" />
                {!collapsed && <span className="truncate">{item.label}</span>}
              </Link>
            );
          })}

          <button
            type="button"
            onClick={() => setAiOpen(true)}
            title={collapsed ? "Trợ lý AI" : undefined}
            className={cn(
              "mt-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white",
              collapsed && "justify-center px-0",
            )}
          >
            <Sparkles className="size-4 shrink-0" />
            {!collapsed && <span className="truncate">Trợ lý AI</span>}
          </button>
        </nav>

        <div className="px-2 pb-2">
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
            {!collapsed && <span className="text-xs">Tự ẩn menu</span>}
          </Button>
        </div>

        <UserMenu
          fullName={user.fullName}
          role={user.role}
          isDemo={user.isDemo}
          collapsed={collapsed}
        />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <main className="min-w-0 flex-1">{children}</main>

        <footer className="flex items-center justify-between border-t border-border bg-card px-5 py-2 text-[11px] text-muted-foreground">
          <span>Phát triển bởi Newtab</span>
          <div className="flex items-center gap-4">
            <span>{user.fullName}</span>
            <span className="flex items-center gap-1.5">
              <span className="size-1.5 rounded-full bg-emerald-500" />
              Hệ thống hoạt động
            </span>
            <span>Thaco Auto Hà Nội</span>
          </div>
        </footer>
      </div>

      <AiChatPanel open={aiOpen} onOpenChange={setAiOpen} />
    </div>
  );
}
