-- Tìm kiếm tên khách phải bỏ dấu: gõ "nguyen van" vẫn ra "Nguyễn Văn".
-- Trên Supabase extension nằm ở schema "extensions" và schema này đã có trong
-- search_path mặc định, nên gọi unaccent(...) không cần chỉ định schema.
CREATE EXTENSION IF NOT EXISTS unaccent;
