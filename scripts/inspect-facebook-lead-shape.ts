import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { resolveActiveFacebookPageIds } from "../src/lib/db/facebook-pages-repo";
import { graphGetAllData } from "../src/lib/facebook/graph-client";
import { resolvePageAccessTokens } from "../src/lib/facebook/page-tokens";

type Form = { id: string; name?: string; questions?: Array<{ key?: string; label?: string; type?: string }> };
type Lead = {
  id: string;
  created_time?: string;
  field_data?: Array<{ name: string; values: string[] }>;
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  campaign_name?: string;
};

async function main() {
  const pageIds = await resolveActiveFacebookPageIds();
  const tokens = await resolvePageAccessTokens(pageIds);

  const out: unknown[] = [];

  for (const pageId of pageIds.slice(0, 4)) {
    const auth = tokens.get(pageId);
    if (!auth) continue;

    const forms = await graphGetAllData<Form>(
      `/${pageId}/leadgen_forms`,
      { fields: "id,name,questions", limit: "5" },
      { accessToken: auth.token },
    );

    for (const form of forms.slice(0, 2)) {
      const leads = await graphGetAllData<Lead>(
        `/${form.id}/leads`,
        {
          fields:
            "id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name",
          limit: "2",
        },
        { accessToken: auth.token },
      );

      out.push({
        pageId,
        pageName: auth.name,
        form: {
          id: form.id,
          name: form.name,
          questions: form.questions ?? [],
        },
        leadCountFetched: leads.length,
        sampleLeads: leads.slice(0, 2).map((lead) => ({
          id: lead.id,
          created_time: lead.created_time,
          campaign_id: lead.campaign_id ?? null,
          campaign_name: lead.campaign_name ?? null,
          adset_id: lead.adset_id ?? null,
          adset_name: lead.adset_name ?? null,
          ad_id: lead.ad_id ?? null,
          ad_name: lead.ad_name ?? null,
          field_data: lead.field_data ?? [],
        })),
      });
    }
  }

  console.log(JSON.stringify(out, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
