CREATE TABLE IF NOT EXISTS "audience_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"description" text,
	"project_id" uuid REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action,
	"filters" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"facebook_ad_account_id" text,
	"facebook_audience_id" text,
	"last_synced_at" timestamp with time zone,
	"last_sync_count" integer DEFAULT 0 NOT NULL,
	"last_sync_status" "meta_sync_status",
	"last_sync_message" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_segments_project_idx" ON "audience_segments" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "audience_segments_created_at_idx" ON "audience_segments" USING btree ("created_at" DESC);
