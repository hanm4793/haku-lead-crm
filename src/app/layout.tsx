import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { ToastProvider } from "@/components/providers/toast-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getScopedViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProjectsForSwitcher, toProjectViewer } from "@/lib/db/project-repo";
import type { ProjectInfo } from "@/lib/types";

import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "latin-ext"],
  variable: "--font-sans",
  display: "swap",
});

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#102a6b",
};

export const metadata: Metadata = {
  title: "SEMTOP Marketing CRM",
  description: "SEMTOP Marketing CRM — quản lý lead đa kênh, marketing Insights và trợ lý AI.",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "SEMTOP CRM",
  },
  formatDetection: {
    telephone: false,
  },
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getScopedViewer();

  let projects: ProjectInfo[] = [];
  const activeProjectId: string | null = viewer?.activeProjectId ?? null;
  if (viewer && isDatabaseConfigured()) {
    try {
      projects = await listProjectsForSwitcher(toProjectViewer(viewer));
    } catch {
      // Chưa có project — shell vẫn mở, super admin tạo trong Cài đặt.
    }
  }

  return (
    <html lang="vi" className={plusJakarta.variable}>
      <body className="min-h-dvh bg-background font-sans antialiased selection:bg-primary/15 selection:text-primary">
        <TooltipProvider delayDuration={150}>
          <ToastProvider>
            <AppShell
              viewer={
                viewer
                  ? {
                      appUserId: viewer.appUserId,
                      fullName: viewer.fullName,
                      role: viewer.role,
                      email: viewer.email,
                      isDemo: viewer.isDemo,
                      aiEnabled: Boolean(viewer.aiEnabled),
                    }
                  : null
              }
              projects={projects}
              activeProjectId={activeProjectId}
            >
              {children}
            </AppShell>
          </ToastProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}
