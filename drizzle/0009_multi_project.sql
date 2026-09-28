-- Multi-project: gắn fanpage + user vào project; bảng kết nối ads Google/TikTok/Zalo

DO $$ BEGIN
  CREATE TYPE "public"."ad_platform" AS ENUM('google', 'tiktok', 'zalo');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

ALTER TABLE "facebook_pages" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE set null;
--> statement-breakpoint

ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE set null;
--> statement-breakpoint

UPDATE "facebook_pages"
SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'semtop-auto' LIMIT 1)
WHERE "project_id" IS NULL;
--> statement-breakpoint

UPDATE "app_users"
SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'semtop-auto' LIMIT 1)
WHERE "project_id" IS NULL AND "role" <> 'SUPER_ADMIN';
--> statement-breakpoint

UPDATE "leads"
SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'semtop-auto' LIMIT 1)
WHERE "project_id" IS NULL;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_ad_accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"platform" "ad_platform" NOT NULL,
	"external_account_id" text NOT NULL,
	"name" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_ad_accounts_project_platform_ext_key" UNIQUE("project_id","platform","external_account_id")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "facebook_pages_project_idx" ON "facebook_pages" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "app_users_project_idx" ON "app_users" USING btree ("project_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "project_ad_accounts_project_idx" ON "project_ad_accounts" USING btree ("project_id");
