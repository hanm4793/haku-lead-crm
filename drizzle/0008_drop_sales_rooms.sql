-- Drop sales_rooms (phòng bán hàng) — không còn dùng trong CRM generic.
ALTER TABLE "leads" DROP COLUMN IF EXISTS "sales_room_id";
--> statement-breakpoint
DROP TABLE IF EXISTS "sales_rooms";
