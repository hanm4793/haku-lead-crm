# CRM Lead THACO Auto

Hệ thống CRM quản lý lead đa kênh: danh sách lead, popup chi tiết, báo cáo phân tích và trợ lý AI.
Backend dùng **Supabase Postgres** (Drizzle ORM) + **Supabase Auth**, phân quyền server-side theo vai trò.

## Công nghệ

| Lớp | Lựa chọn |
| --- | --- |
| Framework | Next.js 16 (App Router, Turbopack) |
| UI | React 19, Tailwind CSS v4, shadcn/ui (Radix) |
| Database | Supabase Postgres + Drizzle ORM + postgres.js |
| Auth | Supabase Auth (`@supabase/ssr`) |
| Biểu đồ | Recharts |
| Excel | ExcelJS |
| AI | Vercel AI SDK + Google Gemini 3.1 Flash-Lite (free tier) |

## Chạy dự án

### 1. Cài dependency

```bash
pnpm install
cp .env.example .env.local
```

### 2. Tạo project Supabase

1. Vào [supabase.com](https://supabase.com) → New project.
2. **Project Settings → Database** lấy:
   - `DATABASE_URL` — Connection pooling, Transaction mode, cổng **6543**
   - `DIRECT_URL` — Direct connection, cổng **5432** (dùng cho migration)
3. **Project Settings → API** lấy:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
4. Dán vào `.env.local`. Tùy chọn: `ADMIN_EMAILS=ban@email.com` để lần đăng nhập đầu được gán quyền ADMIN.

### 3. Migration + seed

```bash
pnpm db:migrate
pnpm db:seed
```

Mặc định seed chỉ nạp **danh mục tham chiếu** (showroom, nhân sự, phòng bán hàng, dòng xe) — không có lead mẫu, phù hợp trước khi đồng bộ Facebook.

Để nạp thêm **704 lead demo** + nhật ký hoạt động (generator deterministic từ `src/lib/mock-data.ts`):

```bash
pnpm db:seed:demo
# hoặc: SEED_DEMO_LEADS=1 pnpm db:seed
```

**Cảnh báo:** `pnpm db:seed` an toàn sau khi đã đồng bộ Facebook — chỉ bổ sung danh mục thiếu, **không xóa lead**. **`pnpm db:seed:demo` xóa toàn bộ lead và lịch sử** rồi nạp lại 704 lead mẫu; **không chạy** trên DB đã có lead Meta thật.

### 4. Dev server

```bash
pnpm dev
```

Mặc định mở tại http://localhost:3000.

| Lệnh | Việc |
| --- | --- |
| `pnpm db:generate` | Sinh SQL migration từ schema |
| `pnpm db:migrate` | Chạy migration |
| `pnpm db:seed` | Bổ sung danh mục; giữ nguyên lead hiện có |
| `pnpm db:seed:demo` | **Xóa hết lead** + nạp danh mục và 704 lead demo (dev only) |
| `pnpm db:studio` | Mở Drizzle Studio |
| `pnpm lint` / `pnpm typecheck` / `pnpm build` | Kiểm tra |

**Auth:** điền `NEXT_PUBLIC_SUPABASE_URL` + `NEXT_PUBLIC_SUPABASE_ANON_KEY` để bật đăng nhập. Thêm email của bạn vào `ADMIN_EMAILS` để lần đăng ký/đăng nhập đầu được quyền ADMIN. Nên tắt **Confirm email** trong Supabase Dashboard → Authentication → Providers → Email.

**Chế độ demo:** nếu chưa điền Supabase Auth, middleware không chặn và `getViewer()` trả về quyền ADMIN.

## Facebook Lead Ads & Marketing (Meta Graph)

Đồng bộ **theo yêu cầu** (nút trên **Cài đặt**), không webhook. Token và ID chỉ đặt trong `.env.local` trên server — **không commit** file này và không dán token vào chat hay git.

### Biến môi trường

Sao chép từ `.env.example` và điền giá trị thật:

| Biến | Mục đích |
| --- | --- |
| `FACEBOOK_ACCESS_TOKEN` | User access token có quyền Page + Ads (server-only) |
| `FACEBOOK_PAGE_ID` | Page nhận lead form |
| `FACEBOOK_AD_ACCOUNT_ID` | Bắt buộc cho Phase B (insights); dạng `act_…` |
| `FACEBOOK_GRAPH_VERSION` | Tùy chọn, mặc định `v21.0` |

**Quyền Meta cần có** (App Review / token dài hạn):

- `pages_manage_ads`
- `pages_read_engagement`
- `leads_retrieval`
- `ads_read`

Nếu token lộ (chat, screenshot, commit nhầm): **rotate ngay** trong [Meta Business Settings](https://business.facebook.com/settings/system-users) / App Dashboard → tạo token mới, cập nhật `.env.local`, deploy lại.

### Quy trình đồng bộ (ADMIN)

1. **Chuẩn bị DB:** `pnpm db:seed` (danh mục, không lead giả).
2. **Phase A — Lead:** Cài đặt → **Xóa lead mẫu** (chỉ lead không có `facebook_lead_id`) → **Đồng bộ lead Facebook**. Lead thiếu SĐT bị bỏ qua; showroom / hãng / phòng BH để trống hiển thị **Chưa phân bổ** trong UI — CRM không tự điền.
3. **Phase B — Insights:** Sau khi lead ổn, bật `FACEBOOK_AD_ACCOUNT_ID` → **Đồng bộ insights** → xem **Marketing** (`/marketing`).
4. Pipeline lead vẫn ở **Leads** (`/leads`) và **Báo cáo** (`/reports`); metrics quảng cáo tách ở `/marketing`.

## Cấu trúc thư mục

```
src/
  app/
    leads/                màn danh sách + Server Actions
    reports/              màn báo cáo (hydrate từ SQL)
    login/                đăng nhập Supabase
    settings/             danh mục, đồng bộ Facebook (ADMIN)
    marketing/            insights Meta (Phase B)
    users/                quản lý tài khoản & phân quyền (ADMIN)
    api/
      ai/chat/            AI Chat — sinh export spec
      leads/search/       lọc/phân trang lead (SQL)
      leads/[id]/logs/    nhật ký lead
      reports/summary/    tổng hợp báo cáo (SQL)
      export/             xuất xlsx/csv
  lib/
    db/                   schema, client, repository, report SQL
    auth/                 getViewer / ViewerScope
    supabase/             browser + server clients
    ai/                   export spec, prompt, refine, model gateway
    reports/              buildReportSummary
  drizzle/                SQL migrations
  scripts/seed.ts         nạp danh mục (tùy chọn lead demo)
```

## Phân quyền (RBAC)

`ViewerScope` được áp **trong repository** (WHERE), phủ mọi đường vào:

| Vai trò | Phạm vi |
| --- | --- |
| `ADMIN` | Toàn bộ lead |
| `SHOWROOM_MANAGER` | Lead thuộc showroom của mình |
| `SALES` | Lead được giao cho mình |

Áp dụng cho `/api/leads/*`, `/api/export`, `/api/ai/chat`, `/api/reports/summary`, Server Actions cập nhật lead.

## Tính năng chính

### Danh sách lead

- KPI + số trên tab tính bằng `count(*) filter` trên Postgres
- Lọc / sắp xếp / phân trang SQL; tìm tên không dấu nhờ extension `unaccent`
- Sửa inline + popup chi tiết: optimistic update, revert khi server từ chối
- Xuất Excel theo bộ lọc đang xem

### Báo cáo

- Server tính toàn bộ chỉ số bằng SQL (`GROUP BY`, `date_trunc`, `count FILTER`)
- Client chỉ nhận con số + vài lead trong danh sách gọi hôm nay
- 3 tab: Tổng quan / Vì sao mất khách / Bảng chi tiết (pivot)

### Trợ lý AI — Export thông minh

1. Prompt chỉ chứa mô tả schema — không có PII.
2. LLM trả `ExportSpec`, validate bằng zod.
3. Server chạy truy vấn + áp `ViewerScope`.
4. Người dùng xem trước rồi mới tải.

## Cấu hình AI

```bash
AI_PROVIDER=google
GOOGLE_GENERATIVE_AI_API_KEY=...   # https://aistudio.google.com/apikey
```

| `AI_PROVIDER` | Model mặc định | Free tier |
| --- | --- | --- |
| `google` | `gemini-3.1-flash-lite` | 1.000–1.500 req/ngày |
| `groq` | `openai/gpt-oss-20b` | 1.000 req/ngày |
| `openrouter` | `google/gemini-2.5-flash-lite` | 50 req/ngày |
| `deepseek` | `deepseek-chat` | theo gói |
| `ollama` | `qwen3:8b` | chạy tại chỗ |

Gọi `GET /api/ai/health` để xem model tài khoản Google thực sự gọi được.
`src/lib/ai/refine-spec.ts` bổ sung thực thể (dòng xe, nguồn, B10…) mà model hay bỏ sót.

## Lộ trình

| Giai đoạn | Nội dung |
| --- | --- |
| 1 (xong) | Frontend đầy đủ |
| 2 (xong) | Backend Postgres + Auth + RBAC + SQL aggregation |
| 3 | Mở rộng AI Chat: hỏi đáp chỉ số, tự dựng biểu đồ |
| 4 | AI theo sự kiện: trùng lead, chấm điểm, phân phối |
| 5 | AI chạy nền: cảnh báo bất thường |
| 6 | Mô hình dự đoán: CPL/CPA, chốt, churn, CLV |
