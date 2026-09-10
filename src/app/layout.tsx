import type { Metadata } from "next";

import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/auth/viewer";

import "./globals.css";

export const metadata: Metadata = {
  title: "CRM THACO Auto — Quản lý khách hàng",
  description: "Hệ thống CRM quản lý lead đa kênh, báo cáo phân tích và trợ lý AI.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const viewer = await getViewer();

  return (
    <html lang="vi">
      <body className="min-h-screen bg-background antialiased">
        <TooltipProvider delayDuration={200}>
          <AppShell
            viewer={
              viewer
                ? { fullName: viewer.fullName, role: viewer.role, isDemo: viewer.isDemo }
                : null
            }
          >
            {children}
          </AppShell>
        </TooltipProvider>
      </body>
    </html>
  );
}
