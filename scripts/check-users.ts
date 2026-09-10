import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { count, isNotNull, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "../src/lib/db/client";
import { appUsers, leads } from "../src/lib/db/schema";

async function main() {
  if (!isDatabaseConfigured()) {
    console.log("database not configured");
    process.exit(1);
  }

  const db = getDb();
  const users = await db
    .select({
      role: appUsers.role,
      hasAuth: sql<boolean>`${appUsers.authUserId} is not null`,
      hasEmail: sql<boolean>`${appUsers.email} is not null`,
      fullName: appUsers.fullName,
      leadCount: sql<number>`(select count(*)::int from leads where leads.assignee_id = ${appUsers.id})`,
    })
    .from(appUsers)
    .orderBy(appUsers.role, appUsers.fullName);

  const [assigned] = await db.select({ n: count() }).from(leads).where(isNotNull(leads.assigneeId));
  const [total] = await db.select({ n: count() }).from(leads);

  console.log("ADMIN_EMAILS set:", Boolean(process.env.ADMIN_EMAILS?.trim()));
  console.log("leads total/assigned:", total.n, "/", assigned.n);
  console.log(
    JSON.stringify(
      users.map((u) => ({
        name: u.fullName,
        role: u.role,
        hasAuth: u.hasAuth,
        hasEmail: u.hasEmail,
        leads: u.leadCount,
      })),
      null,
      2,
    ),
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
