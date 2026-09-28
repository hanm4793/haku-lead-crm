# Multi-project workspace (admin-owned)

## Goal

Super admin tạo **Project** như không gian làm việc. Mỗi project gắn:

- Fanpage Facebook (lead + marketing Meta)
- Partner-admin (+ staff thuộc partner kế thừa project)
- Catalog brand / product / location + nhãn
- Kết nối tài khoản ads/leads: Google, TikTok, Zalo (lưu cấu hình; sync đầy đủ làm sau)
- Lead / insights scoped theo project

## Data model

| Change | Purpose |
| --- | --- |
| `facebook_pages.project_id` | Fanpage thuộc đúng 1 project |
| `app_users.project_id` | Partner/Staff thuộc 1 project; Super admin = null (mọi project) |
| `project_ad_accounts` | Kết nối ngoài Meta: `platform` ∈ google \| tiktok \| zalo (+ optional facebook_ads), `external_account_id`, `name`, `config` jsonb, `active` |

Backfill: mọi page/user/lead hiện có → project `semtop-auto`.

## Runtime

- Cookie `semtop_project_id` = project đang làm việc.
- Super admin: switcher trên header + CRUD project ở Settings.
- Partner/Staff: khóa đúng `app_users.project_id` (không switcher).
- Catalog / lead list / reports / marketing / FB sync lọc theo active project (page thuộc project → lead.project_id).
- Tạo partner bắt buộc chọn project; grant fanpage chỉ trong project đó.

## Out of scope (MVP này)

- Sync thật Google / TikTok / Zalo (chỉ lưu kết nối + UI)
- Attrs form builder (phase sau)
- Partner thuộc nhiều project cùng lúc

## Permissions

| Hạng mục | Super admin | Partner | Staff |
| --- | --- | --- | --- |
| Tạo/sửa project, gán page/partner/ad account | Có | Không | Không |
| Đổi project đang xem (switcher) | Có | Không (cố định) | Không |
| Xem lead/marketing trong project | Mọi project (theo switcher) | Project của mình | Project của mình |
