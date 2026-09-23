# Facebook Lead Ads + Marketing Insights Sync

Date: 2026-09-23  
Status: Approved for planning (brainstorming complete)  
Project: haku-lead-crm

## Problem

CRM hiện chạy trên Neon Postgres + Supabase Auth nhưng lead đang đến từ seed/mock. User đã tạo Meta app với quyền marketing + lead và muốn đồng bộ data thật. Web chưa go-live nên chưa dùng webhook.

## Goals

1. **Phase A — Lead Ads (Graph pull):** Đồng bộ lead từ Facebook Page Leadgen forms vào CRM; xóa lead mẫu; không bịa showroom/hãng/phòng BH.
2. **Phase B — Marketing Insights:** Đồng bộ số liệu chiến dịch vào trang riêng `/marketing`, tách khỏi báo cáo pipeline lead (`/reports`).
3. **Enhance sau go-live:** Webhook Lead Ads realtime (ngoài scope lần này).

## Non-goals (this delivery)

- Facebook JS SDK / browser login OAuth UI
- Zapier / iPaaS
- Webhook subscription
- Tự map form → showroom theo rule phức tạp
- Giữ hoặc mix lead mock với lead thật

## Decisions (locked)

| Topic | Choice |
| --- | --- |
| Sync mode | Manual / on-demand Graph API pull (button). No webhook yet |
| Sample data | Purge all sample leads (+ cascade activity logs). Keep catalogs (showrooms, users, sales rooms, car models) |
| Missing CRM fields | Nullable showroom / sales room / brand / assignee — UI “Chưa phân bổ”. Never invent defaults |
| Missing phone | Skip lead + count as skipped (phone stays NOT NULL) |
| Marketing metrics | Separate feature/page after Lead sync works |
| Graph client | Thin `fetch` to `graph.facebook.com` (no Business SDK required) |

## Architecture

```
[Admin UI: Settings / Marketing]
        │ Server Action (ADMIN only)
        ▼
[facebook/graph-client.ts] ──► Meta Graph API
        │
        ├─ Phase A: leadgen forms → leads upsert
        └─ Phase B: ad account insights → meta_ad_insights upsert
        ▼
[Neon Postgres via Drizzle]
```

Token and IDs live only in server env. Never exposed to the client or logs in full.

## Schema changes

### `leads` alterations

- `showroom_id` → nullable
- `sales_room_id` → nullable
- `brand` → nullable
- Add:
  - `facebook_lead_id` text unique null
  - `facebook_form_id` text null
  - `facebook_page_id` text null
  - `facebook_ad_id` text null
  - `facebook_adset_id` text null
  - `facebook_campaign_id` text null
- Keep `campaign`, `ad_content`, `cost_per_lead` for denormalized names/values **only when Meta provides them**
- `source` = `FACEBOOK`, `channel_detail` = `FORM` for synced leads
- Defaults: `contact_status` = `CHUA_LIEN_HE`, `category` = `CHUA_PHAN_LOAI`

### New: `meta_ad_insights`

- `id` uuid PK
- `level` enum/text: `campaign` | `adset` | `ad`
- `object_id` text (Meta id)
- `object_name` text null
- `date_start` date
- `date_stop` date null
- Metrics (all nullable integers/numerics — empty means unknown, never fake zero unless Meta returns 0):
  - `spend`, `impressions`, `clicks`, `reach`, `leads`
  - `cpc`, `cpm`, `ctr`, `cost_per_lead`
- `synced_at` timestamptz
- Unique `(level, object_id, date_start)`

### New: `meta_sync_runs`

- `id`, `kind` (`leads` | `insights`), `status` (`ok` | `error`)
- `started_at`, `finished_at`
- Counts: `imported`, `updated`, `skipped`, `errors`
- `message` text null

## Environment

```env
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
FACEBOOK_AD_ACCOUNT_ID=   # act_XXXX — required for Phase B
# Optional pin Graph version
FACEBOOK_GRAPH_VERSION=v21.0
```

Document in `.env.example` without secrets. User must rotate any token that was pasted into chat.

## Phase A — Lead sync flow

1. ADMIN clicks “Đồng bộ Facebook Lead” (Settings).
2. Server validates env + ADMIN role; creates `meta_sync_runs` row.
3. `GET /{page-id}/leadgen_forms`
4. For each form: `GET /{form-id}/leads` (paginate)
5. For each lead id: fetch detail fields available to the token (`created_time`, `field_data`, ad/campaign ids/names when permitted)
6. Map `field_data` keys (`full_name`, `phone_number`, etc.) → CRM columns; unknown keys ignored
7. If no usable phone → skip
8. Upsert on `facebook_lead_id`; write activity `CREATE` with actor “Facebook sync” on insert
9. Finish run with counts; Settings shows last sync summary
10. One-shot purge: delete leads where `facebook_lead_id` IS NULL (sample data), cascade logs — only after catalogs retained; expose as ADMIN action “Xóa lead mẫu” or run as part of first successful production cutover script

## Phase B — Insights + Marketing page

1. ADMIN clicks “Đồng bộ Insights” (Settings or Marketing page)
2. `GET /act_XXX/insights` with time range + level (start `campaign`, optionally `ad`)
3. Upsert `meta_ad_insights`
4. New nav item **Marketing** → `/marketing`
   - KPI cards from synced rows only
   - Table by campaign / day
   - Empty state if never synced — no mock charts
5. `/reports` unchanged (CRM pipeline analytics)

## UI rules (accuracy)

- Missing showroom / brand / sales room / assignee → label **“Chưa phân bổ”**
- Missing insight metric → blank / “—” not invented 0
- Settings Facebook row: connected vs missing env; last sync time from `meta_sync_runs`

## RBAC

| Action | Who |
| --- | --- |
| Sync leads / insights / purge samples | ADMIN |
| View `/marketing` | ADMIN (v1) |
| View unassigned FB leads (null showroom/assignee) | ADMIN only via existing scope rules |
| SALES | Only leads assigned to self |
| SHOWROOM_MANAGER | Only leads with matching `showroom_id` |

## Error handling

- Missing env → clear error, no partial fake data
- Graph 401/403 → fail run, message about token/permissions/page
- Rate limit → fail or retry-once with backoff; record in sync run
- Partial form failures → continue other forms; aggregate errors

## Testing

- Unit: field_data mapper; skip without phone; upsert key
- Manual: sync against real Page → list shows only FB leads after purge; Marketing after insights sync
- `db:seed`: stop seeding demo leads for default path; either catalogs-only seed or rename demo seed to `db:seed:demo` (implementation plan decides)

## Implementation order

1. Migration (nullable FKs + Meta columns + new tables)
2. Graph client + lead mapper + sync action
3. Purge sample leads
4. Settings UI wire-up
5. Insights sync + `/marketing` page
6. Docs / `.env.example` / rotate token reminder

## Open points for implementation plan (not blockers)

- Exact Graph field list negotiated against the live token’s permissions
- Default insights date window (e.g. last 30 days) configurable in UI later
- Whether `cost_per_lead` on `leads` is filled from lead-level data only (Phase A) vs left to insights page (prefer: don’t copy guessed CPL onto lead rows)
