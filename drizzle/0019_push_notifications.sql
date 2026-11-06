CREATE TABLE IF NOT EXISTS "push_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action,
	"endpoint" text NOT NULL UNIQUE,
	"p256dh" text NOT NULL,
	"auth" text NOT NULL,
	"user_agent" text,
	"notify_new_lead" boolean DEFAULT true NOT NULL,
	"notify_mention" boolean DEFAULT true NOT NULL,
	"notify_callback" boolean DEFAULT true NOT NULL,
	"notify_daily_digest" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "push_notification_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"dedupe_key" text NOT NULL UNIQUE,
	"user_id" uuid NOT NULL REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action,
	"kind" text NOT NULL,
	"sent_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_notification_logs_user_idx" ON "push_notification_logs" USING btree ("user_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "push_notification_logs_sent_at_idx" ON "push_notification_logs" USING btree ("sent_at" DESC);
