import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { sql } from "drizzle-orm";

import { getDb } from "../src/lib/db/client";
import { syncFacebookLeads } from "../src/lib/facebook/sync-leads";

async function main() {
  const result = await syncFacebookLeads();
  console.log(result.message);

  const db = getDb();
  const [counts] = await db.execute<{ n: number; no_phone: number }>(sql`
    select
      count(*)::int as n,
      count(*) filter (where phone = '')::int as no_phone
    from leads
  `);
  console.log("leads", counts);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
