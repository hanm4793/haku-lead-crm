CREATE TYPE "public"."activity_kind" AS ENUM('CALL', 'STATUS_CHANGE', 'CATEGORY_CHANGE', 'ASSIGN_CHANGE', 'MISSED_CALL', 'B10_SYNC', 'NOTE', 'CREATE');--> statement-breakpoint
CREATE TYPE "public"."b10_status" AS ENUM('CHUA_CO_TREN_B10', 'DA_CO_TREN_B10', 'TRUNG_B10');--> statement-breakpoint
CREATE TYPE "public"."brand" AS ENUM('KIA', 'MAZDA', 'PEUGEOT', 'BMW');--> statement-breakpoint
CREATE TYPE "public"."channel_detail" AS ENUM('TIN_NHAN', 'FORM', 'COMMENT', 'CUOC_GOI', 'CHAT_WEB');--> statement-breakpoint
CREATE TYPE "public"."contact_status" AS ENUM('CHUA_LIEN_HE', 'DA_LIEN_HE');--> statement-breakpoint
CREATE TYPE "public"."fail_reason" AS ENUM('SAI_SO', 'KHONG_CO_NHU_CAU', 'DA_MUA_NOI_KHAC', 'CHI_KHAO_GIA', 'NGOAI_KHA_NANG_TAI_CHINH', 'KH_TINH_KHAC', 'TRUNG_SPAM', 'KHAC');--> statement-breakpoint
CREATE TYPE "public"."lead_category" AS ENUM('CHUA_PHAN_LOAI', 'KHQT', 'GDTD', 'KHD', 'CHUA_LH_DUOC', 'FAIL');--> statement-breakpoint
CREATE TYPE "public"."lead_source" AS ENUM('FACEBOOK', 'GOOGLE', 'TIKTOK', 'ZALO', 'WEBSITE', 'HOTLINE');--> statement-breakpoint
CREATE TYPE "public"."user_role" AS ENUM('ADMIN', 'SHOWROOM_MANAGER', 'SALES');--> statement-breakpoint
CREATE TABLE "activity_logs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"lead_id" uuid NOT NULL,
	"kind" "activity_kind" NOT NULL,
	"message" text NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL,
	"actor_id" uuid,
	"actor_name" text NOT NULL,
	"by_ai" boolean DEFAULT false NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app_users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"auth_user_id" uuid,
	"email" text,
	"full_name" text NOT NULL,
	"role" "user_role" DEFAULT 'SALES' NOT NULL,
	"showroom_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "app_users_auth_user_id_unique" UNIQUE("auth_user_id"),
	CONSTRAINT "app_users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE "car_models" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"brand" "brand" NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "car_models_brand_name_key" UNIQUE("brand","name")
);
--> statement-breakpoint
CREATE TABLE "leads" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"name" text,
	"phone" text NOT NULL,
	"contact_status" "contact_status" DEFAULT 'CHUA_LIEN_HE' NOT NULL,
	"category" "lead_category" DEFAULT 'CHUA_PHAN_LOAI' NOT NULL,
	"fail_reason" "fail_reason",
	"pushed_to_b10" boolean DEFAULT false NOT NULL,
	"b10_status" "b10_status" DEFAULT 'CHUA_CO_TREN_B10' NOT NULL,
	"b10_care_note" text,
	"source" "lead_source" NOT NULL,
	"channel_detail" "channel_detail" NOT NULL,
	"brand" "brand" NOT NULL,
	"showroom_id" uuid NOT NULL,
	"sales_room_id" uuid NOT NULL,
	"assignee_id" uuid,
	"car_model_id" uuid,
	"care_note" text,
	"callback_at" timestamp with time zone,
	"contact_count" integer DEFAULT 0 NOT NULL,
	"last_contact_at" timestamp with time zone,
	"campaign" text,
	"ad_content" text,
	"cost_per_lead" integer
);
--> statement-breakpoint
CREATE TABLE "sales_rooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"manager_id" uuid,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "sales_rooms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
CREATE TABLE "showrooms" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "showrooms_name_unique" UNIQUE("name")
);
--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_lead_id_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."leads"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_logs" ADD CONSTRAINT "activity_logs_actor_id_app_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app_users" ADD CONSTRAINT "app_users_showroom_id_showrooms_id_fk" FOREIGN KEY ("showroom_id") REFERENCES "public"."showrooms"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_showroom_id_showrooms_id_fk" FOREIGN KEY ("showroom_id") REFERENCES "public"."showrooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_sales_room_id_sales_rooms_id_fk" FOREIGN KEY ("sales_room_id") REFERENCES "public"."sales_rooms"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_assignee_id_app_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "leads" ADD CONSTRAINT "leads_car_model_id_car_models_id_fk" FOREIGN KEY ("car_model_id") REFERENCES "public"."car_models"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales_rooms" ADD CONSTRAINT "sales_rooms_manager_id_app_users_id_fk" FOREIGN KEY ("manager_id") REFERENCES "public"."app_users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "activity_logs_lead_at_idx" ON "activity_logs" USING btree ("lead_id","at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_created_at_idx" ON "leads" USING btree ("created_at" DESC NULLS LAST);--> statement-breakpoint
CREATE INDEX "leads_phone_idx" ON "leads" USING btree ("phone");--> statement-breakpoint
CREATE INDEX "leads_category_idx" ON "leads" USING btree ("category");--> statement-breakpoint
CREATE INDEX "leads_source_idx" ON "leads" USING btree ("source");--> statement-breakpoint
CREATE INDEX "leads_showroom_idx" ON "leads" USING btree ("showroom_id");--> statement-breakpoint
CREATE INDEX "leads_assignee_idx" ON "leads" USING btree ("assignee_id");--> statement-breakpoint
CREATE INDEX "leads_callback_at_idx" ON "leads" USING btree ("callback_at");