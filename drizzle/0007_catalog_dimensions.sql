-- Generic catalog dimensions: projects + brands + products + locations + leads.attrs

CREATE TABLE IF NOT EXISTS "projects" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL UNIQUE,
	"name" text NOT NULL,
	"brand_label" text DEFAULT 'Thương hiệu' NOT NULL,
	"product_label" text DEFAULT 'Sản phẩm' NOT NULL,
	"location_label" text DEFAULT 'Địa điểm' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint

INSERT INTO "projects" ("id", "slug", "name", "brand_label", "product_label", "location_label")
VALUES (
  'a0000000-0000-4000-8000-000000000001',
  'semtop-auto',
  'Semtop Auto',
  'Thương hiệu',
  'Dòng xe',
  'Showroom'
)
ON CONFLICT ("slug") DO NOTHING;
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "brands" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"code" text NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "brands_project_code_key" UNIQUE("project_id","code")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "locations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "locations_project_name_key" UNIQUE("project_id","name")
);
--> statement-breakpoint

CREATE TABLE IF NOT EXISTS "products" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE cascade,
	"brand_id" uuid NOT NULL REFERENCES "brands"("id") ON DELETE cascade,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "products_brand_name_key" UNIQUE("brand_id","name")
);
--> statement-breakpoint

-- Seed brands from old enum values
INSERT INTO "brands" ("project_id", "code", "name", "sort_order")
SELECT p.id, v.code, v.name, v.sort_order
FROM "projects" p
CROSS JOIN (VALUES
  ('KIA', 'KIA', 0),
  ('MAZDA', 'Mazda', 1),
  ('PEUGEOT', 'Peugeot', 2),
  ('BMW', 'BMW', 3)
) AS v(code, name, sort_order)
WHERE p.slug = 'semtop-auto'
ON CONFLICT ("project_id", "code") DO NOTHING;
--> statement-breakpoint

-- Copy showrooms → locations (preserve ids so app_users / leads FKs can remap)
INSERT INTO "locations" ("id", "project_id", "name", "active", "sort_order")
SELECT s.id, p.id, s.name, s.active, s.sort_order
FROM "showrooms" s
CROSS JOIN "projects" p
WHERE p.slug = 'semtop-auto'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Copy car_models → products
INSERT INTO "products" ("id", "project_id", "brand_id", "name", "active")
SELECT cm.id, p.id, b.id, cm.name, cm.active
FROM "car_models" cm
JOIN "brands" b ON b.code = cm.brand::text
JOIN "projects" p ON p.id = b.project_id AND p.slug = 'semtop-auto'
ON CONFLICT DO NOTHING;
--> statement-breakpoint

-- Leads: add new columns
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "project_id" uuid REFERENCES "projects"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "brand_id" uuid REFERENCES "brands"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "product_id" uuid REFERENCES "products"("id") ON DELETE set null;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "location_id" uuid REFERENCES "locations"("id") ON DELETE restrict;
--> statement-breakpoint
ALTER TABLE "leads" ADD COLUMN IF NOT EXISTS "attrs" jsonb DEFAULT '{}'::jsonb NOT NULL;
--> statement-breakpoint

UPDATE "leads"
SET "project_id" = (SELECT "id" FROM "projects" WHERE "slug" = 'semtop-auto' LIMIT 1)
WHERE "project_id" IS NULL;
--> statement-breakpoint

UPDATE "leads" AS l
SET "brand_id" = b."id"
FROM "brands" AS b
INNER JOIN "projects" AS p ON p."id" = b."project_id" AND p."slug" = 'semtop-auto'
WHERE l."brand" IS NOT NULL AND b."code" = l."brand"::text AND l."brand_id" IS NULL;
--> statement-breakpoint

UPDATE "leads"
SET
  "product_id" = "car_model_id",
  "location_id" = "showroom_id"
WHERE "product_id" IS NULL OR "location_id" IS NULL;
--> statement-breakpoint

-- app_users: showroom_id → location_id
ALTER TABLE "app_users" ADD COLUMN IF NOT EXISTS "location_id" uuid REFERENCES "locations"("id") ON DELETE set null;
--> statement-breakpoint
UPDATE "app_users" SET "location_id" = "showroom_id" WHERE "showroom_id" IS NOT NULL;
--> statement-breakpoint

-- Drop old FKs / columns / tables / enum
ALTER TABLE "leads" DROP COLUMN IF EXISTS "brand";
--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN IF EXISTS "showroom_id";
--> statement-breakpoint
ALTER TABLE "leads" DROP COLUMN IF EXISTS "car_model_id";
--> statement-breakpoint
DROP INDEX IF EXISTS "leads_showroom_idx";
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "leads_location_idx" ON "leads" USING btree ("location_id");
--> statement-breakpoint

ALTER TABLE "app_users" DROP COLUMN IF EXISTS "showroom_id";
--> statement-breakpoint

DROP TABLE IF EXISTS "car_models";
--> statement-breakpoint
DROP TABLE IF EXISTS "showrooms";
--> statement-breakpoint
DROP TYPE IF EXISTS "public"."brand";
