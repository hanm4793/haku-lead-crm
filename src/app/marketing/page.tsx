import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";

import { MarketingPage } from "@/components/marketing/marketing-page";
import { getViewer } from "@/lib/auth/viewer";
import { getDb, isDatabaseConfigured } from "@/lib/db/client";
import {
  aggregateCampaignInsights,
  listCampaignInsights,
} from "@/lib/db/insights-repo";
import { metaSyncRuns } from "@/lib/db/schema";
import { getFacebookConfig } from "@/lib/facebook/env";

export const metadata = { title: "Marketing — CRM THACO Auto" };
export const dynamic = "force-dynamic";

function defaultRange() {
  const until = new Date();
  const since = new Date(until);
  since.setUTCDate(since.getUTCDate() - 29);
  return {
    from: since.toISOString().slice(0, 10),
    to: until.toISOString().slice(0, 10),
  };
}

export default async function Page() {
  const viewer = await getViewer();
  if (!viewer) redirect("/login?next=%2Fmarketing");
  if (viewer.role !== "ADMIN") redirect("/leads");

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

  const range = defaultRange();
  const db = getDb();
  const [rows, syncRuns] = await Promise.all([
    listCampaignInsights(range),
    db
      .select({ id: metaSyncRuns.id })
      .from(metaSyncRuns)
      .where(eq(metaSyncRuns.kind, "insights"))
      .limit(1),
  ]);
  const config = getFacebookConfig();

  return (
    <MarketingPage
      rows={rows}
      totals={aggregateCampaignInsights(rows)}
      hasSynced={syncRuns.length > 0}
      configured={Boolean(config?.adAccountId)}
      range={range}
    />
  );
}
