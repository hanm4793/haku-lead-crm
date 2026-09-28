CREATE TYPE "public"."user_role_new" AS ENUM('SUPER_ADMIN', 'PARTNER_ADMIN', 'STAFF');--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "role" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "role" TYPE "user_role_new" USING (
  CASE "role"::text
    WHEN 'ADMIN' THEN 'SUPER_ADMIN'
    WHEN 'SHOWROOM_MANAGER' THEN 'STAFF'
    WHEN 'SALES' THEN 'STAFF'
    ELSE 'STAFF'
  END
)::"user_role_new";--> statement-breakpoint
DROP TYPE "public"."user_role";--> statement-breakpoint
ALTER TYPE "public"."user_role_new" RENAME TO "user_role";--> statement-breakpoint
ALTER TABLE "app_users" ALTER COLUMN "role" SET DEFAULT 'STAFF';--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "partner_id" uuid;--> statement-breakpoint
ALTER TABLE "app_users" ADD COLUMN "ai_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_partner_id_app_users_id_fk" FOREIGN KEY ("partner_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE TABLE "user_facebook_pages" (
	"user_id" uuid NOT NULL,
	"facebook_page_id" text NOT NULL,
	CONSTRAINT "user_facebook_pages_pk" PRIMARY KEY("user_id","facebook_page_id"),
	CONSTRAINT "user_facebook_pages_user_id_app_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_users"("id") ON DELETE cascade ON UPDATE no action
);
