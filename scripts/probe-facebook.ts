import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { getFacebookConfig } from "../src/lib/facebook/env";
import { graphGet } from "../src/lib/facebook/graph-client";

async function main() {
  const config = getFacebookConfig();
  if (!config) {
    console.log("config=missing token");
    process.exit(1);
  }
  console.log("tokenLen", config.token.length);
  console.log("adAccount", config.adAccountId);
  console.log("envPages", config.pageIds.length);

  try {
    const me = await graphGet<{ id?: string; name?: string }>("/me", { fields: "id,name" });
    console.log("me", me.id, me.name);
  } catch (error) {
    console.log("me_error", error instanceof Error ? error.message : error);
  }

  try {
    const accounts = await graphGet<{ data?: Array<{ id: string; name?: string }> }>("/me/accounts", {
      fields: "id,name",
      limit: "10",
    });
    console.log(
      "accounts",
      (accounts.data ?? []).map((a) => `${a.id}:${a.name ?? "?"}`).join(" | ") || "(empty)",
    );
  } catch (error) {
    console.log("accounts_error", error instanceof Error ? error.message : error);
  }

  const pageId = config.pageIds[0] ?? "105589125657497";
  try {
    const forms = await graphGet<{ data?: unknown[] }>(`/${pageId}/leadgen_forms`, {
      fields: "id,name",
      limit: "5",
    });
    console.log("forms_count", Array.isArray(forms.data) ? forms.data.length : "no-data");
  } catch (error) {
    console.log("forms_error", error instanceof Error ? error.message : error);
  }

  if (config.adAccountId) {
    try {
      const insights = await graphGet<{ data?: unknown[] }>(`/${config.adAccountId}/insights`, {
        fields: "campaign_id,spend",
        date_preset: "last_7d",
        level: "campaign",
        limit: "3",
      });
      console.log("insights_count", Array.isArray(insights.data) ? insights.data.length : "no-data");
    } catch (error) {
      console.log("insights_error", error instanceof Error ? error.message : error);
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
