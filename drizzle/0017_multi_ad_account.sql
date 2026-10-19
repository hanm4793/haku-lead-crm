-- Thêm cột ad_account_id vào meta_ad_insights để hỗ trợ nhiều tài khoản quảng cáo Meta
ALTER TABLE "meta_ad_insights" ADD COLUMN IF NOT EXISTS "ad_account_id" text;

-- Backfill: gắn ad_account_id mặc định cho dữ liệu cũ (sẽ cập nhật bằng env var khi migrate)
-- Bước này sẽ thực hiện trong code, không cần hardcode ở đây.

-- Xóa unique constraint cũ (level, objectId, dateStart)
ALTER TABLE "meta_ad_insights" DROP CONSTRAINT IF EXISTS "meta_ad_insights_level_object_date";

-- Tạo unique constraint mới bao gồm ad_account_id
CREATE UNIQUE INDEX IF NOT EXISTS "meta_ad_insights_acct_level_object_date"
  ON "meta_ad_insights" ("ad_account_id", "level", "object_id", "date_start");

-- Index trên ad_account_id để query nhanh
CREATE INDEX IF NOT EXISTS "meta_ad_insights_ad_account_idx"
  ON "meta_ad_insights" ("ad_account_id");
