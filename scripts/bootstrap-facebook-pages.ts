import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { ensureFacebookPagesFromEnv, listFacebookPages } from "../src/lib/db/facebook-pages-repo";

async function main() {
  const inserted = await ensureFacebookPagesFromEnv();
  const pages = await listFacebookPages();
  console.log("inserted", inserted);
  console.log(
    "pages",
    pages.map((p) => `${p.facebookPageId}:${p.active ? "on" : "off"}`).join(", "),
  );
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
