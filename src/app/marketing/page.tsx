import { redirect } from "next/navigation";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { canViewMarketing, dataScope, isPageVisible } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import { isDatabaseConfigured } from "@/lib/db/client";
import { hasSyncedInsights, latestInsightSync, listAdInsights, listCampaignInsights } from "@/lib/db/insights-repo";
import { listFacebookPages } from "@/lib/db/facebook-pages-repo";
import { getFacebookConfig } from "@/lib/facebook/env";

export const metadata = { title: "Marketing — SEMTOP Marketing CRM" };
export const dynamic = "force-dynamic";

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmarketing");
  if (!canViewMarketing(viewer.role)) redirect("/leads");

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

  const [campaignRows, adInsightRows, pages, hasSynced, latestSync] = await Promise.all([
    listCampaignInsights(),
    listAdInsights(),
    listFacebookPages(),
    hasSyncedInsights(),
    latestInsightSync(),
  ]);
  const seesAllPages = dataScope(viewer) === "all";
  const adRows = adInsightRows.filter((row) => isPageVisible(viewer, row.pageId));
  const campaignIds = seesAllPages ? null : new Set(adRows.map((row) => row.campaignId).filter(Boolean));
  const rows = campaignIds ? campaignRows.filter((row) => campaignIds.has(row.objectId)) : campaignRows;
  const visiblePages = pages.filter((page) => isPageVisible(viewer, page.facebookPageId)).map(
    (page) => ({ id: page.facebookPageId, name: page.name }),
  );
  const config = getFacebookConfig();

  return (
    <MarketingPage
      rows={rows}
      adRows={adRows}
      pages={visiblePages}
      hasSynced={hasSynced}
      configured={Boolean(config?.adAccountId)}
      adAccountId={config?.adAccountId ?? null}
      syncedAt={latestSync?.finishedAt ?? null}
      today={new Date().toISOString().slice(0, 10)}
    />
  );
}
