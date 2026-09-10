import { redirect } from "next/navigation";

import { NowProvider } from "@/components/providers/now-provider";
import { ReportsPage } from "@/components/reports/reports-page";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { resolvePreset } from "@/lib/date-range";
import { EMPTY_FILTERS } from "@/lib/filters";
import { buildReportSummary } from "@/lib/reports/summary";

export const metadata = { title: "Báo cáo — CRM THACO Auto" };
export const dynamic = "force-dynamic";

export default async function Page() {
  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-bold">Chưa cấu hình database</h1>
        <p className="text-[13px] text-muted-foreground">
          Điền connection string Supabase vào <code className="rounded bg-secondary px-1">.env.local</code> rồi chạy{" "}
          <code className="rounded bg-secondary px-1">pnpm db:migrate</code> và{" "}
          <code className="rounded bg-secondary px-1">pnpm db:seed</code>.
        </p>
      </div>
    );
  }

  const viewer = await getViewer();
  if (!viewer) redirect("/login");

  const now = new Date();
  const range = resolvePreset("THIS_MONTH", now);
  const initialSummary = await buildReportSummary(
    {
      filters: { ...EMPTY_FILTERS, dateFrom: range.from, dateTo: range.to },
      groupBy: "carModel",
      splitBy: null,
      now,
    },
    viewer,
  );

  return (
    <NowProvider value={now.toISOString()}>
      <ReportsPage initialSummary={initialSummary} />
    </NowProvider>
  );
}
