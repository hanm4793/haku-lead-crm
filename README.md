# SEMTOP Marketing CRM

CRM quản lý lead đa kênh + Marketing Insights (Meta): danh sách lead, báo cáo, đồng bộ Facebook Lead Ads, trợ lý AI.
Backend: **Supabase Postgres** (Drizzle) + **Supabase Auth**, RBAC server-side. Chi tiết quyền: [docs/permissions.md](docs/permissions.md).

## Công nghệ

| Lớp | Lựa chọn |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, Radix / shadcn-style, Plus Jakarta Sans |
| Database | Supabase Postgres + Drizzle ORM |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Ads | Meta Graph API (Lead Ads + Insights) |
| Charts / Excel / AI | Recharts, ExcelJS, Vercel AI SDK |

## Chạy dự án

```bash
pnpm install
cp .env.example .env.local
# điền DATABASE_URL, DIRECT_URL, Supabase keys, (tuỳ chọn) Facebook token
pnpm db:migrate
pnpm db:seed          # chỉ danh mục — không xóa lead
pnpm dev              # http://localhost:3000
```

Nhánh feature đầy đủ (Facebook + Marketing + Semtop UI): worktree `.worktrees/facebook-sync` / branch `feature/facebook-sync`.

| Lệnh | Việc |
| --- | --- |
| `pnpm db:migrate` | Chạy migration (gồm drop B10 nếu có `0006_drop_b10`) |
| `pnpm db:seed` | Bổ sung danh mục; **giữ** lead hiện có |
| `pnpm db:seed:demo` | **Xóa hết lead** + 704 lead demo — chỉ dùng khi chưa có data Meta |
| `pnpm typecheck` / `pnpm lint` | Kiểm tra |

## Facebook Lead Ads & Marketing

Đồng bộ **theo nút** trên **Cài đặt** (ADMIN), không webhook.

| Biến | Mục đích |
| --- | --- |
| `FACEBOOK_ACCESS_TOKEN` | User token (server) — sync dùng Page token từ `/me/accounts` |
| `FACEBOOK_PAGE_IDS` / `FACEBOOK_PAGE_ID` | Bootstrap Fanpage |
| `FACEBOOK_AD_ACCOUNT_ID` | Insights (`act_…`) |
| `FACEBOOK_GRAPH_VERSION` | Mặc định `v21.0` |

Quyền Meta: `pages_show_list`, `pages_read_engagement`, `leads_retrieval`, `ads_read` (+ Page access).

**Quy trình:** seed catalogs → đồng bộ lead (import cả lead thiếu SĐT, phone = `""`) → đồng bộ insights → xem `/leads` + `/marketing`. Filter **Fanpage** trên bộ lọc Lead.

Lead Meta **không** có showroom / brand / assignee / phân loại CRM — để trống (**Chưa phân bổ** / chưa phân loại) để sale xử lý.

`field_data` custom (câu hỏi form) hiện **map** name/phone + lưu id campaign/ad; raw JSONB **chưa** lưu (xem lộ trình).

## Đã xử lý / còn lại

### Đã có

- [x] Lead list SQL + RBAC + báo cáo
- [x] Facebook lead sync (multi-page) + Page Access Token
- [x] Marketing Insights + trang `/marketing`
- [x] Filter Fanpage
- [x] Semtop brand (logo, tên, design tokens, font)
- [x] Gỡ B10 khỏi sản phẩm (UI + schema)
- [x] Date range picker + calendar (react-day-picker)

### Còn làm (tương lai)

- [ ] Lưu raw `field_data` (JSONB) + map theo `questions.type`
- [ ] Webhook Leadgen realtime
- [ ] AI hỏi đáp chỉ số / biểu đồ
- [ ] AI chấm điểm / phân phối / cảnh báo nền
- [ ] CPL dự đoán / funnel nâng cao

## Cấu trúc chính

```
src/app/leads|reports|marketing|settings|users|login
src/lib/db|facebook|ai|auth
drizzle/          migrations
docs/superpowers/ specs & plans
```

## Phân quyền

| Vai trò | Phạm vi lead |
| --- | --- |
| ADMIN / SUPER_ADMIN | Toàn bộ |
| SHOWROOM_MANAGER | Showroom của mình |
| SALES | Lead được giao |
| PARTNER (nếu bật) | Theo cấu hình partner |

## AI

```bash
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...
```

Chi tiết model / free tier: xem lịch sử README hoặc `src/lib/ai/`.

## Spec gần đây

- [Semtop rebrand design](docs/superpowers/specs/2026-09-28-semtop-rebrand-design.md)
- Facebook sync: `docs/superpowers/specs/` + `plans/2026-09-23-facebook-sync.md`
