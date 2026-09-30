# SEMTOP Marketing CRM

CRM lead đa kênh + Insights Meta. Auth: **Supabase**. Postgres: **Neon** (Drizzle). App: Next.js 16 trên Vercel.

Quyền: [docs/permissions.md](docs/permissions.md). Việc Báo cáo còn lại: [docs/reports-backlog.md](docs/reports-backlog.md). AI mới đọc docs theo thứ tự ở [docs/README.md](docs/README.md).

## Chạy local

```bash
pnpm install
cp .env.example .env.local
# DATABASE_URL, DIRECT_URL, Supabase keys, (tuỳ chọn) Facebook
pnpm db:migrate
pnpm db:seed
pnpm dev
```

| Lệnh | Việc |
| --- | --- |
| `pnpm db:migrate` | Migration |
| `pnpm db:seed` | Danh mục — **không** xóa lead |
| `pnpm db:seed:demo` | **Xóa hết lead** rồi seed demo |
| `pnpm typecheck` / `pnpm lint` | Kiểm tra |

## Đã có

- Lead (SQL + RBAC), Báo cáo (Tổng quan + Pivot; **không** còn tab Loss), Marketing Insights
- Đồng bộ Facebook Lead Ads / Insights **bấm nút** trên Cài đặt (Super admin), không webhook
- Đa project: `/projects`, cookie `semtop_project_id`, catalog brand/product/location, attr fields
- Marketing lọc theo **grant ∩ fanpage của project đang xem**
- Trợ lý AI (Super luôn; Partner khi bật cờ)
- Brand Semtop, gỡ B10

Lead Meta không invent brand/product/assignee/phân loại. Thiếu SĐT vẫn import (`phone = ""`). `field_data` lạ merge vào `leads.attrs`; **không** lưu raw JSONB form.

## Facebook

| Biến | Mục đích |
| --- | --- |
| `FACEBOOK_ACCESS_TOKEN` | User token server |
| `FACEBOOK_PAGE_IDS` / `FACEBOOK_PAGE_ID` | Fanpage |
| `FACEBOOK_AD_ACCOUNT_ID` | Insights `act_…` |
| `FACEBOOK_GRAPH_VERSION` | Mặc định `v21.0` |

## Role

`SUPER_ADMIN` · `PARTNER_ADMIN` · `STAFF` — chi tiết `docs/permissions.md`. Không còn ADMIN / SHOWROOM_MANAGER / SALES.

## Deploy (team Vercel `haku-dev`)

Alias ổn định: https://haku-lead-crm-haku-dev.vercel.app  
Mỗi `vercel deploy` Preview tạo URL hash mới; gắn alias này khi cần dùng một link cố định.

## Việc chưa làm

Xem [docs/reports-backlog.md](docs/reports-backlog.md) và: webhook Leadgen, raw `field_data`, sync Google/TikTok/Zalo (chỉ lưu kết nối), filter/report theo attr.
