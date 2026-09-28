import { existsSync } from "node:fs";
if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { sql } from "drizzle-orm";

import { getDb } from "../src/lib/db/client";

async function main() {
  const db = getDb();
  const [s] = await db.execute<{
    total: number;
    has_name: number;
    has_phone: number;
    has_location: number;
    has_brand: number;
    has_assignee: number;
    has_product: number;
    has_campaign: number;
    has_ad_content: number;
    has_fb_page: number;
    has_fb_lead_id: number;
    has_fb_form: number;
    has_fb_ad: number;
    has_fb_campaign_id: number;
    has_care_note: number;
    has_callback: number;
    contacted: number;
    classified: number;
    has_cpl: number;
    oldest: string;
    newest: string;
  }>(sql`
    select
      count(*)::int as total,
      count(*) filter (where name is not null and name <> '')::int as has_name,
      count(*) filter (where phone is not null and phone <> '')::int as has_phone,
      count(*) filter (where location_id is not null)::int as has_location,
      count(*) filter (where brand_id is not null)::int as has_brand,
      count(*) filter (where assignee_id is not null)::int as has_assignee,
      count(*) filter (where product_id is not null)::int as has_product,
      count(*) filter (where campaign is not null)::int as has_campaign,
      count(*) filter (where ad_content is not null)::int as has_ad_content,
      count(*) filter (where facebook_page_id is not null)::int as has_fb_page,
      count(*) filter (where facebook_lead_id is not null)::int as has_fb_lead_id,
      count(*) filter (where facebook_form_id is not null)::int as has_fb_form,
      count(*) filter (where facebook_ad_id is not null)::int as has_fb_ad,
      count(*) filter (where facebook_campaign_id is not null)::int as has_fb_campaign_id,
      count(*) filter (where care_note is not null)::int as has_care_note,
      count(*) filter (where callback_at is not null)::int as has_callback,
      count(*) filter (where contact_status = 'DA_LIEN_HE')::int as contacted,
      count(*) filter (where category <> 'CHUA_PHAN_LOAI')::int as classified,
      count(*) filter (where cost_per_lead is not null)::int as has_cpl,
      min(created_at)::text as oldest,
      max(created_at)::text as newest
    from leads
  `);

  const byPage = await db.execute(sql`
    select coalesce(fp.name, l.facebook_page_id) as page, count(*)::int as n
    from leads l
    left join facebook_pages fp on fp.facebook_page_id = l.facebook_page_id
    group by 1
    order by n desc
  `);

  const byCat = await db.execute(sql`
    select category, contact_status, count(*)::int as n
    from leads
    group by 1, 2
    order by n desc
  `);

  const samples = await db.execute(sql`
    select
      name,
      phone,
      brand_id is not null as has_brand,
      campaign,
      ad_content,
      facebook_page_id,
      facebook_ad_id,
      facebook_campaign_id,
      location_id is not null as has_location,
      assignee_id is not null as has_assignee,
      category,
      contact_status,
      source,
      channel_detail
    from leads
    order by created_at desc
    limit 5
  `);

  console.log(JSON.stringify({ summary: s, byPage, byCat, samples }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
