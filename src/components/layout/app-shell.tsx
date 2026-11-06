"use client";

import * as React from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  Briefcase,
  ChevronLeft,
  ChevronRight,
  KeyRound,
  LayoutGrid,
  Loader2,
  LogOut,
  Megaphone,
  Settings,
  Shield,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";

import { signOut } from "@/app/auth/actions";
import { AiChatPanel } from "@/components/ai/ai-chat-panel";
import { ProjectProvider, ProjectSwitcher, useProjectContext } from "@/components/layout/project-switcher";
import { UserMenu } from "@/components/layout/user-menu";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { canSeeNav, canUseAi, canViewMarketing, ROLE_LABELS, type NavGate, type UserRole } from "@/lib/auth/roles";
import type { ProjectInfo } from "@/lib/types";
import { cn } from "@/lib/utils";

const NAV_ITEMS: { href: string; label: string; shortLabel: string; icon: typeof Users; access: NavGate }[] = [
  { href: "/leads", label: "Quản lý Lead", shortLabel: "Lead", icon: Users, access: "all" },
  { href: "/reports", label: "Báo cáo", shortLabel: "Báo cáo", icon: BarChart3, access: "reports" },
  { href: "/marketing", label: "Marketing", shortLabel: "Marketing", icon: Megaphone, access: "marketing" },
  { href: "/projects", label: "Dự án", shortLabel: "Dự án", icon: Briefcase, access: "projects" },
  { href: "/users", label: "Người dùng", shortLabel: "Tài khoản", icon: Shield, access: "users" },
  { href: "/settings", label: "Cài đặt App", shortLabel: "Cài đặt", icon: Settings, access: "settings" },
];

function resolvePageTitle(pathname: string): string {
  if (pathname.startsWith("/leads")) return "Lead";
  if (pathname.startsWith("/reports")) return "Báo cáo";
  if (pathname.startsWith("/marketing")) return "Marketing";
  if (pathname.startsWith("/projects")) return "Dự án";
  if (pathname.startsWith("/users")) return "Người dùng";
  if (pathname.startsWith("/settings")) return "Cài đặt App";
  if (pathname.startsWith("/account/password")) return "Đổi mật khẩu";
  if (pathname.startsWith("/account")) return "Hồ sơ cá nhân";
  return "SEMTOP CRM";
}

function MainContentArea({
  children,
  pendingHref,
}: {
  children: React.ReactNode;
  pendingHref: string | null;
}) {
  const { isSwitchingProject, switchingToProject } = useProjectContext();
  const isNavigating = Boolean(pendingHref) && !isSwitchingProject;

  const loadingMessage = switchingToProject
    ? `Đang chuyển sang dự án «${switchingToProject.name}»...`
    : "Đang chuyển dự án...";

  return (
    <main
      className="relative flex min-w-0 flex-1 flex-col max-md:pb-[calc(3.85rem+env(safe-area-inset-bottom,0px))]"
      aria-busy={isSwitchingProject || isNavigating}
    >
      {/* Thanh tiến trình mỏng mượt khi chuyển trang — không khóa cứng màn hình */}
      {isNavigating && (
        <div
          role="progressbar"
          aria-label="Đang chuyển trang"
          className="pointer-events-none fixed inset-x-0 top-0 z-[60] h-0.5 overflow-hidden bg-primary/15"
        >
          <div className="h-full w-2/3 animate-pulse rounded-full bg-primary" />
        </div>
      )}

      <div
        className={cn(
          "flex min-h-full flex-1 flex-col transition-opacity duration-150",
          isSwitchingProject && "pointer-events-none select-none opacity-55",
          isNavigating && "opacity-90",
        )}
      >
        {children}
      </div>

      {isSwitchingProject && (
        <div
          role="status"
          aria-live="polite"
          className="fixed inset-0 z-50 flex cursor-wait items-center justify-center bg-slate-900/15 backdrop-blur-[1.5px] p-4"
        >
          <div className="flex items-center gap-3 rounded-2xl border border-border bg-card px-5 py-3.5 shadow-xl ring-1 ring-black/5">
            <Loader2 className="size-5 shrink-0 animate-spin text-primary" />
            <div className="flex flex-col">
              <span className="text-sm font-semibold text-foreground">{loadingMessage}</span>
              <span className="text-[11px] text-muted-foreground">Vui lòng đợi trong giây lát</span>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export function AppShell({
  children,
  viewer,
  projects = [],
  activeProjectId = null,
}: {
  children: React.ReactNode;
  viewer?: {
    fullName: string;
    role: UserRole;
    email?: string | null;
    isDemo: boolean;
    aiEnabled: boolean;
  } | null;
  projects?: ProjectInfo[];
  activeProjectId?: string | null;
}) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);
  const [aiOpen, setAiOpen] = React.useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = React.useState(false);
  const [pendingHref, setPendingHref] = React.useState<string | null>(null);
  const [prevPathname, setPrevPathname] = React.useState(pathname);

  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setPendingHref(null);
    setMobileMenuOpen(false);
  }

  // Trên Tablet (768px - 1023px), mặc định thu gọn thành Navigation Rail để nhường diện tích cho bảng dữ liệu
  React.useEffect(() => {
    const mql = window.matchMedia("(max-width: 1023px)");
    const raf = window.requestAnimationFrame(() => {
      if (mql.matches) setCollapsed(true);
    });
    const handleChange = (event: MediaQueryListEvent) => {
      if (event.matches) setCollapsed(true);
    };
    mql.addEventListener("change", handleChange);
    return () => {
      window.cancelAnimationFrame(raf);
      mql.removeEventListener("change", handleChange);
    };
  }, []);

  const user = viewer ?? {
    fullName: "Chế độ demo",
    role: "SUPER_ADMIN" as const,
    email: null,
    isDemo: true,
    aiEnabled: true,
  };
  const showAi = canUseAi(user);

  // Phím tắt toàn cục Ctrl+K / Cmd+K mở nhanh Trợ lý AI trên Desktop
  React.useEffect(() => {
    if (!showAi || pathname.startsWith("/login")) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAiOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [showAi, pathname]);

  if (pathname.startsWith("/login")) return <>{children}</>;

  const navItems = NAV_ITEMS.filter((item) => canSeeNav(user.role, item.access));
  const effectivePathname = pendingHref ?? pathname;
  const pageTitle = resolvePageTitle(effectivePathname);

  // Chia tab cho thanh Bottom Tab Bar chuẩn Native trên điện thoại:
  // Tối đa 3 tab chính + nút AI (nếu có) + nút Thêm (More) để luôn đạt vùng chạm >= 64px rộng rãi
  const maxPrimaryMobileTabs = showAi ? 3 : Math.min(4, navItems.length);
  const primaryMobileTabs = navItems.slice(0, maxPrimaryMobileTabs);
  const overflowMobileTabs = navItems.slice(maxPrimaryMobileTabs);
  const isOverflowRouteActive =
    overflowMobileTabs.some((item) => effectivePathname.startsWith(item.href)) ||
    (primaryMobileTabs.length > 1 && effectivePathname.startsWith("/account"));

  const initials =
    user.fullName
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase() ?? "")
      .join("") || "?";

  const handleNavClick = (href: string) => {
    if (!pathname.startsWith(href)) {
      setPendingHref(href);
    }
    setMobileMenuOpen(false);
    if (typeof window !== "undefined" && window.innerWidth < 1024) {
      setCollapsed(true);
    }
  };

  return (
    <ProjectProvider
      value={{
        projects,
        activeProjectId,
        role: user.role,
      }}
    >
      <div className="flex min-h-dvh flex-col md:flex-row">
        {/* Overlay mờ trên Tablet khi mở rộng Navigation Rail */}
        {!collapsed && (
          <>
            <div className="hidden w-[4.25rem] shrink-0 md:max-lg:block" aria-hidden />
            <div
              className="fixed inset-0 z-30 hidden bg-slate-900/35 backdrop-blur-[1px] md:max-lg:block"
              onClick={() => setCollapsed(true)}
              aria-hidden
            />
          </>
        )}

        {/* DESKTOP & TABLET SIDEBAR (Ẩn hoàn toàn trên Mobile < 768px để nhường 100% chiều ngang) */}
        <aside
          className={cn(
            "sticky top-0 hidden h-dvh shrink-0 flex-col bg-sidebar text-sidebar-foreground md:flex",
            collapsed
              ? "w-[4.25rem]"
              : "w-60 md:max-lg:fixed md:max-lg:inset-y-0 md:max-lg:left-0 md:max-lg:z-40 md:max-lg:shadow-2xl",
          )}
        >
          <div
            className={cn(
              "flex items-center border-b border-white/10 py-3",
              collapsed ? "justify-center px-2" : "px-3",
            )}
          >
            <Link
              href="/leads"
              onClick={() => handleNavClick("/leads")}
              className={cn(
                "flex items-center justify-center rounded-lg bg-white shadow-sm ring-1 ring-black/5 transition-transform active:scale-[0.98]",
                collapsed ? "p-1.5" : "px-2.5 py-1.5",
              )}
            >
              <Image
                src={collapsed ? "/brand/logo-mark.png" : "/brand/logo-white.png"}
                alt="SEMTOP"
                width={collapsed ? 32 : 140}
                height={collapsed ? 32 : 36}
                className={cn("object-contain", collapsed ? "h-7 w-7" : "h-8 w-auto")}
                priority
              />
            </Link>
          </div>

          <nav className="thin-scrollbar mt-3 flex flex-1 flex-col gap-1 overflow-y-auto px-2.5">
            {navItems.map((item) => {
              const active = effectivePathname.startsWith(item.href);
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  title={collapsed ? item.label : undefined}
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium transition-colors",
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
                onClick={() => {
                  if (typeof window !== "undefined" && window.innerWidth < 1024) {
                    setCollapsed(true);
                  }
                  setAiOpen(true);
                }}
                title={collapsed ? "Trợ lý AI (Ctrl+K)" : undefined}
                className={cn(
                  "mt-1 flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13.5px] font-medium text-white/85 transition-colors hover:bg-white/10 hover:text-white",
                  aiOpen && "bg-white/15 text-white",
                  collapsed && "justify-center px-0",
                )}
              >
                <Sparkles className="size-4 shrink-0 text-sky-300" />
                {!collapsed && (
                  <>
                    <span className="flex-1 truncate text-left">Trợ lý AI</span>
                    <kbd className="rounded border border-white/20 bg-white/10 px-1.5 py-0.5 font-sans text-[10px] font-medium text-white/75">
                      Ctrl K
                    </kbd>
                  </>
                )}
              </button>
            )}
          </nav>

          <div className="space-y-1 px-2.5 pb-2">
            {!collapsed && (
              <div className="flex items-center gap-1.5 px-2.5 py-1 text-[11px] text-white/55">
                <span className="size-1.5 rounded-full bg-emerald-400" />
                <span className="truncate">Hệ thống hoạt động</span>
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setCollapsed((v) => !v)}
              title={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
              className={cn(
                "w-full justify-start gap-2 text-white/70 hover:bg-white/10 hover:text-white",
                collapsed && "justify-center px-0",
              )}
            >
              <ChevronLeft className={cn("size-4 transition-transform duration-150", collapsed && "rotate-180")} />
              {!collapsed && <span className="text-xs">Thu gọn</span>}
            </Button>
          </div>

          <UserMenu
            fullName={user.fullName}
            role={ROLE_LABELS[user.role]}
            email={user.email}
            isDemo={user.isDemo}
            collapsed={collapsed}
          />
        </aside>

        {/* MOBILE TOP APP BAR (Chuẩn Native iOS / Android, chỉ hiện < 768px) */}
        <header className="sticky top-0 z-30 flex items-center justify-between gap-2 border-b border-border/80 bg-card/92 px-3.5 py-2 backdrop-blur-md pt-[calc(0.5rem+env(safe-area-inset-top,0px))] md:hidden">
          <div className="flex min-w-0 items-center gap-2.5">
            <Link
              href="/leads"
              onClick={() => handleNavClick("/leads")}
              className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-white shadow-2xs ring-1 ring-border"
            >
              <Image
                src="/brand/logo-mark.png"
                alt="SEMTOP"
                width={24}
                height={24}
                className="size-5.5 object-contain"
                priority
              />
            </Link>
            <span className="truncate text-[16px] font-bold tracking-tight text-slate-900">
              {pageTitle}
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-1.5">
            <ProjectSwitcher className="h-8 max-w-[164px] rounded-full border-border/90 bg-slate-50/90 px-2.5 text-xs shadow-none" />
            {showAi && (
              <button
                type="button"
                onClick={() => setAiOpen(true)}
                aria-label="Mở Trợ lý AI"
                className={cn(
                  "flex size-8.5 items-center justify-center rounded-full border border-primary/20 bg-primary/8 text-primary transition-transform active:scale-92",
                  aiOpen && "bg-primary text-primary-foreground",
                )}
              >
                <Sparkles className="size-4" />
              </button>
            )}
          </div>
        </header>

        {/* MAIN WORKSPACE */}
        <div className="flex min-w-0 flex-1 flex-col">
          <MainContentArea pendingHref={pendingHref}>{children}</MainContentArea>
        </div>

        {/* MOBILE BOTTOM TAB BAR (Chuẩn Native Thumb-Zone < 768px) */}
        <nav
          aria-label="Điều hướng chính trên di động"
          className="fixed inset-x-0 bottom-0 z-40 border-t border-border/85 bg-card/95 backdrop-blur-lg pb-[env(safe-area-inset-bottom,0px)] shadow-[0_-4px_20px_rgba(15,23,42,0.06)] md:hidden"
        >
          <div className="mx-auto flex h-[3.65rem] max-w-lg items-stretch justify-around px-1">
            {primaryMobileTabs.map((item) => {
              const active = effectivePathname.startsWith(item.href) && !mobileMenuOpen && !aiOpen;
              const Icon = item.icon;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  prefetch
                  onClick={() => handleNavClick(item.href)}
                  className={cn(
                    "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-transform active:scale-95",
                    active ? "text-primary" : "text-slate-500 hover:text-slate-800",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                      active && "bg-primary/12",
                    )}
                  >
                    <Icon className={cn("size-[19px]", active && "stroke-[2.25px]")} />
                  </span>
                  <span className={cn("truncate text-[10.5px] leading-tight", active ? "font-semibold" : "font-medium")}>
                    {item.shortLabel}
                  </span>
                </Link>
              );
            })}

            {/* Khi nhân viên chỉ có 1 tab Lead, hiển thị trực tiếp tab Hồ sơ để cân đối thanh điều hướng */}
            {primaryMobileTabs.length === 1 && (
              <Link
                href="/account"
                prefetch
                onClick={() => handleNavClick("/account")}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-transform active:scale-95",
                  effectivePathname.startsWith("/account") && !mobileMenuOpen
                    ? "text-primary"
                    : "text-slate-500 hover:text-slate-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                    effectivePathname.startsWith("/account") && !mobileMenuOpen && "bg-primary/12",
                  )}
                >
                  <UserRound
                    className={cn(
                      "size-[19px]",
                      effectivePathname.startsWith("/account") && !mobileMenuOpen && "stroke-[2.25px]",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "truncate text-[10.5px] leading-tight",
                    effectivePathname.startsWith("/account") && !mobileMenuOpen ? "font-semibold" : "font-medium",
                  )}
                >
                  Hồ sơ
                </span>
              </Link>
            )}

            {showAi && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  setAiOpen(true);
                }}
                className={cn(
                  "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-transform active:scale-95",
                  aiOpen ? "text-primary" : "text-slate-500 hover:text-slate-800",
                )}
              >
                <span
                  className={cn(
                    "flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                    aiOpen ? "bg-primary/15 text-primary" : "bg-sky-500/8 text-primary",
                  )}
                >
                  <Sparkles className="size-[19px]" />
                </span>
                <span className={cn("truncate text-[10.5px] leading-tight", aiOpen ? "font-semibold" : "font-medium")}>
                  Trợ lý AI
                </span>
              </button>
            )}

            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className={cn(
                "relative flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 px-1 transition-transform active:scale-95",
                mobileMenuOpen || isOverflowRouteActive ? "text-primary" : "text-slate-500 hover:text-slate-800",
              )}
            >
              <span
                className={cn(
                  "relative flex h-7 w-11 items-center justify-center rounded-full transition-colors",
                  (mobileMenuOpen || isOverflowRouteActive) && "bg-primary/12",
                )}
              >
                <LayoutGrid className={cn("size-[19px]", (mobileMenuOpen || isOverflowRouteActive) && "stroke-[2.25px]")} />
                {isOverflowRouteActive && !mobileMenuOpen && (
                  <span className="absolute right-2 top-1 size-1.5 rounded-full bg-primary" />
                )}
              </span>
              <span
                className={cn(
                  "truncate text-[10.5px] leading-tight",
                  mobileMenuOpen || isOverflowRouteActive ? "font-semibold" : "font-medium",
                )}
              >
                Thêm
              </span>
            </button>
          </div>
        </nav>

        {/* MOBILE "THÊM" BOTTOM SHEET (Tất cả phân hệ + Quản lý tài khoản) */}
        <Dialog open={mobileMenuOpen} onOpenChange={setMobileMenuOpen}>
          <DialogContent className="gap-3 p-4 md:hidden">
            <DialogTitle className="sr-only">Menu mở rộng & Tài khoản</DialogTitle>
            <DialogDescription className="sr-only">
              Chuyển nhanh giữa các phân hệ và quản lý tài khoản cá nhân
            </DialogDescription>

            {/* Thẻ thông tin người dùng */}
            <div className="flex items-center gap-3 rounded-xl border border-border bg-slate-50/80 p-3">
              <div className="flex size-11 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-xs">
                {initials}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-bold text-slate-900">{user.fullName}</div>
                <div className="truncate text-xs text-muted-foreground">
                  {user.isDemo ? "Chế độ Demo" : user.email || ROLE_LABELS[user.role]}
                </div>
              </div>
              <span className="shrink-0 rounded-full border border-primary/20 bg-primary/10 px-2.5 py-0.5 text-[11px] font-semibold text-primary">
                {ROLE_LABELS[user.role]}
              </span>
            </div>

            {/* Danh sách các phân hệ bổ sung (lọc đúng theo phân quyền canSeeNav) */}
            {overflowMobileTabs.length > 0 && (
              <div className="space-y-1">
                <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                  Phân hệ quản lý
                </div>
                <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                  {overflowMobileTabs.map((item) => {
                    const active = effectivePathname.startsWith(item.href);
                    const Icon = item.icon;
                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        prefetch
                        onClick={() => handleNavClick(item.href)}
                        className={cn(
                          "flex items-center justify-between gap-3 px-3.5 py-3 text-sm font-medium transition-colors active:bg-accent",
                          active ? "bg-primary/6 text-primary font-semibold" : "text-slate-800",
                        )}
                      >
                        <span className="flex items-center gap-3">
                          <span
                            className={cn(
                              "flex size-8 items-center justify-center rounded-lg",
                              active ? "bg-primary text-primary-foreground" : "bg-slate-100 text-slate-600",
                            )}
                          >
                            <Icon className="size-4" />
                          </span>
                          <span>{item.label}</span>
                        </span>
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </Link>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Nhóm tài khoản & Bảo mật */}
            <div className="space-y-1">
              <div className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                Tài khoản cá nhân
              </div>
              <div className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border bg-card">
                <Link
                  href="/account"
                  prefetch
                  onClick={() => handleNavClick("/account")}
                  className={cn(
                    "flex items-center justify-between gap-3 px-3.5 py-3 text-sm font-medium transition-colors active:bg-accent",
                    effectivePathname === "/account" ? "bg-primary/6 text-primary font-semibold" : "text-slate-800",
                  )}
                >
                  <span className="flex items-center gap-3">
                    <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                      <UserRound className="size-4" />
                    </span>
                    <span>Thông tin tài khoản</span>
                  </span>
                  <ChevronRight className="size-4 text-muted-foreground" />
                </Link>

                {!user.isDemo && (
                  <Link
                    href="/account/password"
                    prefetch
                    onClick={() => handleNavClick("/account/password")}
                    className={cn(
                      "flex items-center justify-between gap-3 px-3.5 py-3 text-sm font-medium transition-colors active:bg-accent",
                      effectivePathname.startsWith("/account/password")
                        ? "bg-primary/6 text-primary font-semibold"
                        : "text-slate-800",
                    )}
                  >
                    <span className="flex items-center gap-3">
                      <span className="flex size-8 items-center justify-center rounded-lg bg-slate-100 text-slate-600">
                        <KeyRound className="size-4" />
                      </span>
                      <span>Đổi mật khẩu</span>
                    </span>
                    <ChevronRight className="size-4 text-muted-foreground" />
                  </Link>
                )}

                {!user.isDemo && (
                  <form action={signOut}>
                    <button
                      type="submit"
                      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm font-medium text-rose-600 transition-colors active:bg-rose-50"
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex size-8 items-center justify-center rounded-lg bg-rose-50 text-rose-600">
                          <LogOut className="size-4" />
                        </span>
                        <span>Đăng xuất</span>
                      </span>
                    </button>
                  </form>
                )}
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {showAi && (
          <AiChatPanel
            open={aiOpen}
            onOpenChange={setAiOpen}
            canSeeMarketing={canViewMarketing(user.role)}
          />
        )}
      </div>
    </ProjectProvider>
  );
}
