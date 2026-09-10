import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { eq, or, sql } from "drizzle-orm";

import { getDb, isDatabaseConfigured } from "../src/lib/db/client";
import { appUsers } from "../src/lib/db/schema";

const EMAIL = (process.argv[2] ?? process.env.ADMIN_EMAILS?.split(",")[0] ?? "")
  .trim()
  .toLowerCase();

async function main() {
  if (!EMAIL) {
    console.error("Usage: tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }
  if (!isDatabaseConfigured()) {
    console.error("database not configured");
    process.exit(1);
  }

  const db = getDb();
  const existing = await db
    .select({
      id: appUsers.id,
      fullName: appUsers.fullName,
      role: appUsers.role,
      email: appUsers.email,
    })
    .from(appUsers)
    .where(or(eq(appUsers.email, EMAIL), sql`lower(${appUsers.fullName}) = ${EMAIL}`))
    .limit(5);

  const byEmail = existing.filter((u) => u.email?.toLowerCase() === EMAIL);
  if (byEmail.length === 0) {
    console.error("No app_users row with email", EMAIL);
    console.error("Sign in once so the account is provisioned, then re-run.");
    process.exit(1);
  }

  for (const user of byEmail) {
    if (user.role === "ADMIN") {
      console.log("already ADMIN:", user.fullName);
      continue;
    }
    await db.update(appUsers).set({ role: "ADMIN" }).where(eq(appUsers.id, user.id));
    console.log("promoted:", user.fullName, "-> ADMIN");
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
