CREATE TABLE IF NOT EXISTS "project_members" (
  "project_id" uuid NOT NULL REFERENCES "projects"("id") ON DELETE CASCADE,
  "user_id" uuid NOT NULL REFERENCES "app_users"("id") ON DELETE CASCADE,
  PRIMARY KEY ("project_id", "user_id")
);
--> statement-breakpoint
INSERT INTO "project_members" ("project_id", "user_id")
SELECT "project_id", "id"
FROM "app_users"
WHERE "project_id" IS NOT NULL
  AND "role" IN ('PARTNER_ADMIN', 'STAFF')
ON CONFLICT DO NOTHING;
