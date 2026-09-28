DO $$ BEGIN
  CREATE TYPE "public"."attr_field_type" AS ENUM('text', 'number', 'select', 'date');
EXCEPTION
  WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "project_attr_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"key" text NOT NULL,
	"label" text NOT NULL,
	"field_type" "attr_field_type" DEFAULT 'text' NOT NULL,
	"options" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"required" boolean DEFAULT false NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "project_attr_fields_project_key" UNIQUE("project_id","key")
);
--> statement-breakpoint

CREATE INDEX IF NOT EXISTS "project_attr_fields_project_idx" ON "project_attr_fields" USING btree ("project_id");
