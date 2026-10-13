CREATE INDEX IF NOT EXISTS "leads_project_created_idx" ON "leads" USING btree ("project_id", "created_at");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_project_page_idx" ON "leads" USING btree ("project_id", "facebook_page_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_brand_id_idx" ON "leads" USING btree ("brand_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_product_id_idx" ON "leads" USING btree ("product_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "meta_ad_insights_level_date_idx" ON "meta_ad_insights" USING btree ("level", "date_start");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_members_user_idx" ON "project_members" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_users_partner_idx" ON "app_users" USING btree ("partner_id");
