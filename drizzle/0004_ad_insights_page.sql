ALTER TABLE "meta_ad_insights" ADD COLUMN "campaign_id" text;--> statement-breakpoint
ALTER TABLE "meta_ad_insights" ADD COLUMN "campaign_name" text;--> statement-breakpoint
ALTER TABLE "meta_ad_insights" ADD COLUMN "adset_id" text;--> statement-breakpoint
ALTER TABLE "meta_ad_insights" ADD COLUMN "adset_name" text;--> statement-breakpoint
ALTER TABLE "meta_ad_insights" ADD COLUMN "page_id" text;--> statement-breakpoint
CREATE INDEX "meta_ad_insights_page_idx" ON "meta_ad_insights" USING btree ("page_id");--> statement-breakpoint
CREATE INDEX "meta_ad_insights_campaign_idx" ON "meta_ad_insights" USING btree ("campaign_id");