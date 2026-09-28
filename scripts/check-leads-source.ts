import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { count, isNotNull, isNull, sql } from "drizzle-orm";
import { getDb } from "../src/lib/db/client";
import { leads } from "../src/lib/db/schema";

async function main() {
  const db = getDb();
  const [total] = await db.select({ n: count() }).from(leads);
  const [fb] = await db.select({ n: count() }).from(leads).where(isNotNull(leads.facebookLeadId));
  const [sample] = await db.select({ n: count() }).from(leads).where(isNull(leads.facebookLeadId));
  const byPage = await db
    .select({
      pageId: sql<string>`coalesce(${leads.facebookPageId}, '(null)')`,
      n: count(),
    })
    .from(leads)
    .groupBy(leads.facebookPageId);

  console.log(
    JSON.stringify(
      {
        total: Number(total.n),
        withFacebookId: Number(fb.n),
        withoutFacebookId: Number(sample.n),
        byPage,
      },
      null,
      2,
    ),
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
