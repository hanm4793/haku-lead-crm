import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listProjectsForSwitcher, resolveActiveProject, toProjectInfo, toProjectViewer } from "@/lib/db/project-repo";
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
  const viewer = await getViewer();

  let projects: ProjectInfo[] = [];
  let activeProjectId: string | null = null;
  if (viewer && isDatabaseConfigured()) {
    try {
      const active = await resolveActiveProject(toProjectViewer(viewer));
      activeProjectId = active.id;
      projects = await listProjectsForSwitcher(toProjectViewer(viewer));
      if (projects.length === 0) projects = [toProjectInfo(active)];
    } catch {
      // Chưa có project — shell vẫn mở, super admin tạo trong Cài đặt.
    }
  }

  return (
    <html lang="vi" className={plusJakarta.variable}>
      <body className="min-h-screen bg-background font-sans antialiased">
        <TooltipProvider delayDuration={200}>
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
        </TooltipProvider>
      </body>
    </html>
  );
}
