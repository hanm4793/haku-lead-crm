CREATE TYPE "public"."meta_insight_level" AS ENUM('campaign', 'adset', 'ad');--> statement-breakpoint
CREATE TYPE "public"."meta_sync_kind" AS ENUM('leads', 'insights');--> statement-breakpoint
CREATE TYPE "public"."meta_sync_status" AS ENUM('ok', 'error');--> statement-breakpoint
CREATE TABLE "meta_ad_insights" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"level" "meta_insight_level" NOT NULL,
	"object_id" text NOT NULL,
	"object_name" text,
	"date_start" timestamp with time zone NOT NULL,
	"date_stop" timestamp with time zone,
	"spend" double precision,
	"impressions" integer,
	"clicks" integer,
	"reach" integer,
	"leads" integer,
	"cpc" double precision,
	"cpm" double precision,
	"ctr" double precision,
	"cost_per_lead" double precision,
	"synced_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "meta_ad_insights_level_object_date" UNIQUE("level","object_id","date_start")
);
--> statement-breakpoint
CREATE TABLE "meta_sync_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" "meta_sync_kind" NOT NULL,
	"status" "meta_sync_status" NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"imported" integer DEFAULT 0 NOT NULL,
	"updated" integer DEFAULT 0 NOT NULL,
	"skipped" integer DEFAULT 0 NOT NULL,
	"errors" integer DEFAULT 0 NOT NULL,
	"message" text
);
--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "brand" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "showroom_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ALTER COLUMN "sales_room_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_lead_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_form_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_page_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_ad_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_adset_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN "facebook_campaign_id" text;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_facebook_lead_id_unique" UNIQUE("facebook_lead_id");