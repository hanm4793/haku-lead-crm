import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { purgeSampleLeads } from "../src/lib/facebook/purge-sample-leads";
import { syncFacebookLeads } from "../src/lib/facebook/sync-leads";
import { syncFacebookInsights } from "../src/lib/facebook/sync-insights";
import { ensureFacebookPagesFromEnv, listFacebookPages } from "../src/lib/db/facebook-pages-repo";

async function main() {
  console.log("1) ensure facebook pages from env…");
  const inserted = await ensureFacebookPagesFromEnv();
  const pages = await listFacebookPages();
  console.log("   inserted", inserted, "active", pages.filter((p) => p.active).length);

  console.log("2) purge sample leads…");
  const purged = await purgeSampleLeads();
  console.log("   deleted", purged.deleted);

  console.log("3) sync Facebook leads…");
  const leads = await syncFacebookLeads();
  console.log("   ", leads.message);

  console.log("4) sync Facebook insights…");
  const insights = await syncFacebookInsights();
  console.log("   ", insights.message);

  console.log("DONE");
}

main().catch((error) => {
  console.error("FAILED", error instanceof Error ? error.message : error);
  process.exit(1);
});
