import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "../src/lib/db/client";
import { activityLogs, appUsers, leads, showrooms } from "../src/lib/db/schema";

async function main() {
  console.log("configured", isDatabaseConfigured());
  console.log("host", (() => {
    try {
      return new URL(process.env.DATABASE_URL!.replace(/^"|"$/g, "")).host;
    } catch {
      return "invalid-url";
    }
  })());

  const db = getDb();
  const [leadCount] = await db.select({ n: sql<number>`count(*)::int` }).from(leads);
  const [showroomCount] = await db.select({ n: sql<number>`count(*)::int` }).from(showrooms);
  const [userCount] = await db.select({ n: sql<number>`count(*)::int` }).from(appUsers);
  const [logCount] = await db.select({ n: sql<number>`count(*)::int` }).from(activityLogs);

  console.log("leads", leadCount.n);
  console.log("showrooms", showroomCount.n);
  console.log("users", userCount.n);
  console.log("logs", logCount.n);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("FAILED", error instanceof Error ? error.message : error);
    process.exit(1);
  });
