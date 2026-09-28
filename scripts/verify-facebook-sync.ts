import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { getDb } from "../src/lib/db/client";
import { syncFacebookInsights } from "../src/lib/facebook/sync-insights";

async function main() {
  try {
    const insights = await syncFacebookInsights();
    console.log("insights:", insights.message);
  } catch (error) {
    console.log("insights_error:", error instanceof Error ? error.message : error);
  }

  const db = getDb();
  const leads = await db.execute(
    "select count(*)::int as n, count(facebook_page_id)::int as with_page from leads",
  );
  const byPage = await db.execute(
    "select facebook_page_id as page_id, count(*)::int as n from leads group by 1 order by n desc",
  );
  const pages = await db.execute(
    "select facebook_page_id as page_id, name, active from facebook_pages order by name nulls last",
  );
  const insightRows = await db.execute("select count(*)::int as n from meta_ad_insights");

  console.log(JSON.stringify({ leads, byPage, pages, insightRows }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
