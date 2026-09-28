import type { Metadata } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";

import { AppShell } from "@/components/layout/app-shell";
import { TooltipProvider } from "@/components/ui/tooltip";
import { getViewer } from "@/lib/auth/viewer";

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
                    isDemo: viewer.isDemo,
                    aiEnabled: Boolean(viewer.aiEnabled),
                  }
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
