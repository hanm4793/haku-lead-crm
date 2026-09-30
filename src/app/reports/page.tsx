import { redirect } from "next/navigation";

import { NowProvider } from "@/components/providers/now-provider";
import { ReportsPage } from "@/components/reports/reports-page";
import { canViewReports, isPageVisible } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { catalogOptionsFromReference, DEFAULT_LEAD_CATALOG } from "@/lib/catalog";
import { isDatabaseConfigured } from "@/lib/db/client";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { listAttrFields } from "@/lib/db/attr-fields-repo";
import { getReferenceData } from "@/lib/db/leads-repo";
import { resolvePreset } from "@/lib/date-range";
import { EMPTY_FILTERS } from "@/lib/filters";
import { buildReportSummary } from "@/lib/reports/summary";
import { listAssignableStaff } from "@/lib/db/users-repo";

export const metadata = { title: "Báo cáo — SEMTOP Marketing CRM" };
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

  const viewer = await getScopedViewer();
  if (!viewer) redirect("/login");
  if (!canViewReports(viewer.role)) redirect("/leads");

  const projectId = viewer.activeProjectId ?? undefined;
  const now = new Date();
  const range = resolvePreset("THIS_MONTH", now);
  const [initialSummary, facebookPages, assignees, reference, attrFields] = await Promise.all([
    buildReportSummary(
      {
        filters: { ...EMPTY_FILTERS, dateFrom: range.from, dateTo: range.to },
        groupBy: "source",
        splitBy: null,
        now,
      },
      viewer,
    ),
    listFacebookPages(projectId ? { projectId } : undefined),
    listAssignableStaff(viewer),
    getReferenceData(projectId).catch(() => null),
    projectId ? listAttrFields(projectId, { activeOnly: true }).catch(() => []) : Promise.resolve([]),
  ]);
  const catalog = reference ? catalogOptionsFromReference(reference) : DEFAULT_LEAD_CATALOG;

  const fanpageOptions = facebookPages
    .filter((page) => page.active && isPageVisible(viewer, page.facebookPageId))
    .map((page) => ({
      value: page.facebookPageId,
      label: page.name?.trim() || page.facebookPageId,
    }));

  return (
    <NowProvider value={now.toISOString()}>
      <ReportsPage
        initialSummary={initialSummary}
        fanpageOptions={fanpageOptions}
        assignees={assignees}
        catalog={catalog}
        attrFields={attrFields}
      />
    </NowProvider>
  );
}
