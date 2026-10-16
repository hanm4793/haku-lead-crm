import type { Metadata } from "next";
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

export const metadata: Metadata = {
  title: "SEMTOP Marketing CRM",
  description: "SEMTOP Marketing CRM — quản lý lead đa kênh, marketing Insights và trợ lý AI.",
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
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider delayDuration={200}>
          <ToastProvider>
          <AppShell
            viewer={
              viewer
                ? {
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
