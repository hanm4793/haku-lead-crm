CREATE TABLE IF NOT EXISTS "lead_comments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL REFERENCES "leads"("id") ON DELETE cascade,
	"user_id" uuid REFERENCES "app_users"("id") ON DELETE set null,
	"user_name" text NOT NULL,
	"user_role" "user_role",
	"content" text NOT NULL,
	"parent_id" uuid REFERENCES "lead_comments"("id") ON DELETE cascade,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "lead_comments_lead_idx" ON "lead_comments" USING btree ("lead_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_comments_parent_idx" ON "lead_comments" USING btree ("parent_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "lead_comments_created_at_idx" ON "lead_comments" USING btree ("created_at");
