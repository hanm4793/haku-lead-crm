import { redirect } from "next/navigation";

import { MarketingPage } from "@/components/marketing/marketing-page";
import {
  canManageAudiences,
  canManageSettings,
  canViewMarketing,
  isMarketingRowVisible,
  isPageVisible,
} from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import {
  listAudienceCampaignOptions,
  listAudienceSegments,
} from "@/lib/db/audiences-repo";
import { isDatabaseConfigured } from "@/lib/db/client";
import {
  hasSyncedInsights,
  latestInsightSync,
  listAdInsights,
  listCampaignInsights,
  queryCrmAttributionByPage,
} from "@/lib/db/insights-repo";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { getReferenceData } from "@/lib/db/leads-repo";
import {
  listProjects,
  listProjectsForSwitcher,
  toProjectViewer,
} from "@/lib/db/project-repo";
import { getFacebookConfig } from "@/lib/facebook/env";
import { toDateInputValue } from "@/lib/utils";

export const metadata = { title: "Marketing — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getScopedViewer();
  if (!viewer) redirect("/login?next=%2Fmarketing");
  if (!canViewMarketing(viewer.role)) redirect("/leads");
  const projectId = viewer.activeProjectId ?? undefined;

  if (!isDatabaseConfigured()) {
    return (
      <div className="mx-auto max-w-xl space-y-3 p-8">
        <h1 className="text-xl font-bold">Chưa cấu hình database</h1>
        <p className="text-[13px] text-muted-foreground">
          Cần <code className="rounded bg-secondary px-1">DATABASE_URL</code> để xem Insights.
        </p>
      </div>
    );
  }

  const viewerScopedPageIds =
    viewer.role !== "SUPER_ADMIN" ? [...viewer.pageIds] : null;

  const [
    campaignRows,
    adInsightRows,
    allPages,
    accessibleProjects,
    savedAudiences,
    audienceCampaigns,
    hasSynced,
    latestSync,
    crmRows,
    reference,
  ] = await Promise.all([
    listCampaignInsights(undefined, viewerScopedPageIds),
    listAdInsights(undefined, viewerScopedPageIds),
    listFacebookPages().catch(() => []),
    viewer.role === "SUPER_ADMIN"
      ? listProjects({ activeOnly: true }).catch(() => [])
      : listProjectsForSwitcher(toProjectViewer(viewer)).catch(() => []),
    canManageAudiences(viewer.role) ? listAudienceSegments().catch(() => []) : Promise.resolve([]),
    canManageAudiences(viewer.role) ? listAudienceCampaignOptions().catch(() => []) : Promise.resolve([]),
    hasSyncedInsights(),
    latestInsightSync(),
    queryCrmAttributionByPage({ pageIds: viewerScopedPageIds }).catch(() => []),
    getReferenceData(projectId).catch(() => null),
  ]);

  const adRows = adInsightRows.filter((row) => isMarketingRowVisible(viewer, row.pageId, viewerScopedPageIds));
  const campaignIds =
    viewerScopedPageIds !== null
      ? new Set(adRows.map((row) => row.campaignId).filter(Boolean))
      : null;
  const rows = campaignIds ? campaignRows.filter((row) => campaignIds.has(row.objectId)) : campaignRows;
  const visiblePages = allPages
    .filter((page) => isPageVisible(viewer, page.facebookPageId))
    .map((page) => ({ id: page.facebookPageId, name: page.name }));
  const audiencePages = allPages
    .filter((page) => page.active && isPageVisible(viewer, page.facebookPageId))
    .map((page) => ({
      id: page.facebookPageId,
      name: page.name,
      projectId: page.projectId,
    }));
  const projectOptions = accessibleProjects.map((p) => ({ id: p.id, name: p.name }));
  const brandOptions = reference?.brands.map((b) => ({ code: b.code, name: b.name })) ?? [];
  const config = getFacebookConfig();

  return (
    <MarketingPage
      rows={rows}
      adRows={adRows}
      crmRows={crmRows}
      brandOptions={brandOptions}
      pages={visiblePages}
      activeProjectId={viewer.activeProjectId ?? null}
      projects={projectOptions}
      allPages={audiencePages}
      savedAudiences={savedAudiences}
      audienceCampaigns={audienceCampaigns}
      canManageAudiences={canManageAudiences(viewer.role)}
      tokenConfigured={Boolean(config?.token)}
      hasSynced={hasSynced}
      configured={Boolean(config?.adAccountId)}
      adAccountId={config?.adAccountId ?? null}
      syncedAt={latestSync?.finishedAt ?? null}
      today={toDateInputValue(new Date().toISOString())}
      canSync={canManageSettings(viewer.role)}
    />
  );
}

