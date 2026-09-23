# Facebook Lead Ads + Marketing Insights Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pull real Facebook Lead Ads into CRM (purge mock leads), then sync Marketing Insights onto a new `/marketing` page — never invent missing CRM fields.

**Architecture:** Thin server-side Graph API client (`fetch`) + Drizzle upserts. ADMIN-only Server Actions for sync/purge. Lead pipeline (`/reports`) stays separate from Meta Insights (`/marketing`).

**Tech Stack:** Next.js 16 App Router, Drizzle + Neon Postgres, Supabase Auth (existing), Meta Graph API REST, Vitest for pure mapper unit tests.

## Global Constraints

- Sync mode: on-demand Graph pull only (no webhook this delivery)
- Never invent showroom / sales room / brand / assignee / CPL
- Missing phone → skip lead (do not insert)
- Token only in server env; never commit or return to client
- Purge sample leads (`facebook_lead_id IS NULL`); keep catalogs
- Phase A (leads) before Phase B (insights + `/marketing`)
- UI empty labels: **“Chưa phân bổ”** / **“—”** for missing metrics

## File map

| File | Responsibility |
| --- | --- |
| `src/lib/db/schema.ts` | Nullable lead FKs/brand; Meta columns; `meta_ad_insights`; `meta_sync_runs` |
| `drizzle/0002_*.sql` | Generated migration |
| `src/lib/types.ts` | `Lead.brand` / showroom fields nullable where needed |
| `src/lib/facebook/env.ts` | Read/validate FB env |
| `src/lib/facebook/graph-client.ts` | Paginated Graph GET helper |
| `src/lib/facebook/map-lead.ts` | `field_data` → CRM draft (pure) |
| `src/lib/facebook/sync-leads.ts` | Orchestrate lead sync + run row |
| `src/lib/facebook/sync-insights.ts` | Orchestrate insights sync |
| `src/lib/facebook/purge-sample-leads.ts` | Delete non-FB leads |
| `src/app/settings/facebook-actions.ts` | ADMIN server actions |
| `src/components/settings/facebook-sync-panel.tsx` | Settings UI |
| `src/app/marketing/page.tsx` | Marketing page (ADMIN) |
| `src/components/marketing/marketing-page.tsx` | Insights UI |
| `src/lib/db/insights-repo.ts` | Query/upsert insights |
| `scripts/seed.ts` | Catalogs only (no demo leads) |
| `.env.example` | FB env keys (empty) |
| `src/lib/facebook/map-lead.test.ts` | Vitest |

---

### Task 1: Schema + types for nullable assignment + Meta lead ids

**Files:**
- Modify: `src/lib/db/schema.ts`
- Modify: `src/lib/types.ts`
- Create: migration via `pnpm db:generate` → `drizzle/0002_*.sql`
- Modify: `src/lib/db/leads-repo.ts` (map null showroom/brand to UI strings)
- Modify: display sites that assume non-null brand/showroom (columns, metrics, filters as needed)

**Interfaces:**
- Produces: `leads.facebookLeadId`, nullable `showroomId` / `salesRoomId` / `brand`
- Produces: tables `metaAdInsights`, `metaSyncRuns` (schema only; used in later tasks)

- [ ] **Step 1: Update `schema.ts`**

In `leads` table:
- `showroomId` and `salesRoomId`: remove `.notNull()`
- `brand`: remove `.notNull()`
- Add text columns: `facebookLeadId` (`.unique()`), `facebookFormId`, `facebookPageId`, `facebookAdId`, `facebookAdsetId`, `facebookCampaignId`

Add enums/tables:

```ts
export const metaInsightLevelEnum = pgEnum("meta_insight_level", ["campaign", "adset", "ad"]);
export const metaSyncKindEnum = pgEnum("meta_sync_kind", ["leads", "insights"]);
export const metaSyncStatusEnum = pgEnum("meta_sync_status", ["ok", "error"]);

export const metaAdInsights = pgTable(
  "meta_ad_insights",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    level: metaInsightLevelEnum("level").notNull(),
    objectId: text("object_id").notNull(),
    objectName: text("object_name"),
    dateStart: timestamp("date_start", { withTimezone: true }).notNull(),
    dateStop: timestamp("date_stop", { withTimezone: true }),
    spend: text("spend"), // store Meta string/number as text or numeric — prefer numeric via drizzle doublePrecision/numeric
    impressions: integer("impressions"),
    clicks: integer("clicks"),
    reach: integer("reach"),
    leads: integer("leads"),
    cpc: text("cpc"),
    cpm: text("cpm"),
    ctr: text("ctr"),
    costPerLead: text("cost_per_lead"),
    syncedAt: timestamp("synced_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [unique("meta_ad_insights_level_object_date").on(t.level, t.objectId, t.dateStart)],
);

export const metaSyncRuns = pgTable("meta_sync_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  kind: metaSyncKindEnum("kind").notNull(),
  status: metaSyncStatusEnum("status").notNull(),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  imported: integer("imported").notNull().default(0),
  updated: integer("updated").notNull().default(0),
  skipped: integer("skipped").notNull().default(0),
  errors: integer("errors").notNull().default(0),
  message: text("message"),
});
```

Prefer `doublePrecision` for spend/cpc/cpm/ctr/costPerLead if comfortable; otherwise text is fine if parsing is centralized.

- [ ] **Step 2: Update `Lead` type**

```ts
brand: Brand | null;
showroom: string; // keep display string; use "Chưa phân bổ" when null in mapper
// add optional meta ids on Lead if UI needs them later — optional for v1
```

In `mapLeadRow` (leads-repo): `showroom: row.showroomName ?? "Chưa phân bổ"`, `brand: row.brand` (allow null), `salesRoom: row.salesRoomName ?? "Chưa phân bổ"`.

- [ ] **Step 3: Generate + run migration**

```bash
pnpm db:generate
pnpm db:migrate
```

Expected: migration applies on Neon without error.

- [ ] **Step 4: Typecheck and fix call sites**

```bash
pnpm typecheck
```

Fix any `Lead["brand"]` exhaustiveness / insert paths that require brand/showroom (seed will change in Task 7).

- [ ] **Step 5: Commit**

```bash
git add src/lib/db/schema.ts src/lib/types.ts src/lib/db/leads-repo.ts drizzle/
git commit -m "feat(db): nullable lead assignment fields and Meta sync tables"
```

---

### Task 2: Vitest + pure `field_data` mapper

**Files:**
- Modify: `package.json` (add `vitest`, script `test`)
- Create: `vitest.config.ts`
- Create: `src/lib/facebook/map-lead.ts`
- Create: `src/lib/facebook/map-lead.test.ts`

**Interfaces:**
- Produces:

```ts
export type FacebookFieldDatum = { name: string; values: string[] };

export interface MappedFacebookLead {
  ok: true;
  phone: string;
  name: string | null;
  // only Meta-backed optional strings
  campaign: string | null;
  adContent: string | null;
} | { ok: false; reason: "missing_phone" };

export function mapFacebookLeadFields(
  fieldData: FacebookFieldDatum[],
  meta?: { campaignName?: string | null; adName?: string | null },
): MappedFacebookLead;
```

- [ ] **Step 1: Add Vitest**

```bash
pnpm add -D vitest
```

`package.json` scripts: `"test": "vitest run"`

`vitest.config.ts`:

```ts
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  test: { environment: "node" },
  resolve: { alias: { "@": path.resolve(__dirname, "./src") } },
});
```

- [ ] **Step 2: Write failing tests**

```ts
import { describe, expect, it } from "vitest";
import { mapFacebookLeadFields } from "./map-lead";

describe("mapFacebookLeadFields", () => {
  it("maps phone and name", () => {
    const r = mapFacebookLeadFields([
      { name: "full_name", values: ["Nguyen A"] },
      { name: "phone_number", values: ["0901234567"] },
    ]);
    expect(r).toEqual({
      ok: true,
      phone: "0901234567",
      name: "Nguyen A",
      campaign: null,
      adContent: null,
    });
  });

  it("skips when phone missing", () => {
    const r = mapFacebookLeadFields([{ name: "full_name", values: ["X"] }]);
    expect(r).toEqual({ ok: false, reason: "missing_phone" });
  });

  it("accepts alternate phone keys", () => {
    const r = mapFacebookLeadFields([{ name: "phone", values: ["+84901234567"] }]);
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.phone).toContain("84901234567");
  });
});
```

- [ ] **Step 3: Run tests — expect FAIL**

```bash
pnpm test
```

- [ ] **Step 4: Implement `map-lead.ts`**

Normalize phone: trim; keep digits and leading `+`; reject empty.  
Phone keys (case-insensitive): `phone_number`, `phone`, `mobile_phone`.  
Name keys: `full_name`, `first_name` (+ optional `last_name` join).  
Attach `meta.campaignName` / `meta.adName` only if provided (non-empty).

- [ ] **Step 5: Run tests — expect PASS**

```bash
pnpm test
```

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-lock.yaml vitest.config.ts src/lib/facebook/
git commit -m "feat(facebook): map Lead Ads field_data with tests"
```

---

### Task 3: Graph client + env helper

**Files:**
- Create: `src/lib/facebook/env.ts`
- Create: `src/lib/facebook/graph-client.ts`
- Modify: `.env.example`

**Interfaces:**
- Produces:

```ts
export function getFacebookConfig(): {
  token: string;
  pageId: string;
  adAccountId: string | null;
  graphVersion: string;
} | null;

export class FacebookGraphError extends Error {
  status: number;
  code?: number;
}

export async function graphGet<T>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T>;

export async function graphGetAllData<T>(
  path: string,
  searchParams?: Record<string, string>,
): Promise<T[]>; // follows paging.next / cursors
```

- [ ] **Step 1: Implement `env.ts`**

Return `null` if `FACEBOOK_ACCESS_TOKEN` or `FACEBOOK_PAGE_ID` missing.  
`FACEBOOK_AD_ACCOUNT_ID` optional for Phase A.  
`FACEBOOK_GRAPH_VERSION` default `v21.0`.  
Never log token.

- [ ] **Step 2: Implement `graph-client.ts`**

Base URL: `https://graph.facebook.com/${version}`.  
Always pass `access_token` as query param.  
On non-OK: parse Graph error JSON message into `FacebookGraphError`.  
`graphGetAllData`: loop while `paging.cursors.after` / `paging.next` exists; cap pages at 50 to avoid runaway.

- [ ] **Step 3: Update `.env.example`**

```env
FACEBOOK_ACCESS_TOKEN=
FACEBOOK_PAGE_ID=
FACEBOOK_AD_ACCOUNT_ID=
FACEBOOK_GRAPH_VERSION=v21.0
```

Remind in comment: rotate tokens pasted into chat.

- [ ] **Step 4: Commit**

```bash
git add src/lib/facebook/env.ts src/lib/facebook/graph-client.ts .env.example
git commit -m "feat(facebook): Graph API client and env config"
```

---

### Task 4: Lead sync orchestration + purge sample leads

**Files:**
- Create: `src/lib/facebook/sync-leads.ts`
- Create: `src/lib/facebook/purge-sample-leads.ts`
- Create: `src/app/settings/facebook-actions.ts`

**Interfaces:**
- Consumes: `getFacebookConfig`, `graphGet`, `graphGetAllData`, `mapFacebookLeadFields`, `getDb`, schema
- Produces:

```ts
export interface SyncLeadsResult {
  imported: number;
  updated: number;
  skipped: number;
  errors: number;
  message: string;
  runId: string;
}

export async function syncFacebookLeads(): Promise<SyncLeadsResult>;
export async function purgeSampleLeads(): Promise<{ deleted: number }>;

// Server actions
export async function syncFacebookLeadsAction(): Promise<{ ok: true; result: SyncLeadsResult } | { ok: false; error: string }>;
export async function purgeSampleLeadsAction(): Promise<{ ok: true; deleted: number } | { ok: false; error: string }>;
```

- [ ] **Step 1: Implement `sync-leads.ts`**

Algorithm:
1. Insert `meta_sync_runs` kind=`leads` status provisional — or insert at end only; prefer insert at start with status `error` then update to `ok`.
2. `graphGetAllData<{ id: string; name?: string }>(`/${pageId}/leadgen_forms`)`
3. For each form id: `graphGetAllData` `/${formId}/leads` with fields  
   `id,created_time,field_data,ad_id,ad_name,adset_id,adset_name,campaign_id,campaign_name`  
   If Graph rejects field set, retry with `id,created_time,field_data` only.
4. Map fields; skip missing phone.
5. Upsert: select by `facebookLeadId`; update name/campaign/ad meta; insert with `source: "FACEBOOK"`, `channelDetail: "FORM"`, null showroom/salesRoom/brand/assignee, `createdAt` from `created_time` when parseable.
6. On insert: activity log CREATE actorName `"Facebook sync"`.
7. Finalize sync run counts + message.

Do **not** set `costPerLead` from guesses.

- [ ] **Step 2: Implement `purge-sample-leads.ts`**

```ts
// delete from leads where facebook_lead_id is null
// activity_logs cascade
```

Return deleted count via `returning` or `rowCount`.

- [ ] **Step 3: Server actions with ADMIN gate**

Mirror `src/app/users/actions.ts` pattern: `getViewer()`, require `role === "ADMIN"`, `revalidatePath("/leads")`, `revalidatePath("/settings")`.

- [ ] **Step 4: Manual smoke (local)**

Put token + page id in `.env.local` (do not commit).  
From a one-off script or temporary call: run sync once; confirm counts.  
If Page has zero leads, result may be imported=0 — still ok.

- [ ] **Step 5: Commit**

```bash
git add src/lib/facebook/sync-leads.ts src/lib/facebook/purge-sample-leads.ts src/app/settings/facebook-actions.ts
git commit -m "feat(facebook): sync Lead Ads and purge sample leads"
```

---

### Task 5: Settings UI — connect status + sync/purge buttons

**Files:**
- Create: `src/components/settings/facebook-sync-panel.tsx`
- Modify: `src/app/settings/page.tsx`
- Optional: small query helper for last `meta_sync_runs`

**Interfaces:**
- Consumes: `syncFacebookLeadsAction`, `purgeSampleLeadsAction`
- Props: `{ configured: boolean; lastLeadSync: { at: string; status: string; message: string | null } | null; isAdmin: boolean }`

- [ ] **Step 1: Server-load last sync on settings page**

Query latest `meta_sync_runs` where kind=`leads` order by `startedAt` desc limit 1.

- [ ] **Step 2: Client panel**

- Badge: Đã cấu hình / Chưa có env  
- Buttons (ADMIN only): “Đồng bộ Facebook Lead”, “Xóa lead mẫu” (confirm dialog text: xóa mọi lead không có facebook_lead_id)  
- Show last result message / counts after action  
- Disable buttons while pending

- [ ] **Step 3: Replace Settings stub**

Change `Facebook Lead Ads` row from “Chưa kết nối” to the panel.

- [ ] **Step 4: Manual UI check**

Login as ADMIN → Settings → sync → Leads list.  
Purge samples → only FB leads remain (or empty if no FB leads).

- [ ] **Step 5: Commit**

```bash
git add src/components/settings/facebook-sync-panel.tsx src/app/settings/page.tsx
git commit -m "feat(settings): Facebook lead sync controls"
```

---

### Task 6: Insights sync + repo + Marketing page (Phase B)

**Files:**
- Create: `src/lib/facebook/sync-insights.ts`
- Create: `src/lib/db/insights-repo.ts`
- Modify: `src/app/settings/facebook-actions.ts` (add `syncFacebookInsightsAction`)
- Create: `src/app/marketing/page.tsx`
- Create: `src/components/marketing/marketing-page.tsx`
- Modify: `src/components/layout/app-shell.tsx` (nav item ADMIN)

**Interfaces:**
- Produces:

```ts
export async function syncFacebookInsights(options?: {
  since?: string; // YYYY-MM-DD
  until?: string;
}): Promise<SyncLeadsResult>; // reuse count shape or dedicated SyncInsightsResult

export async function listCampaignInsights(range: { from: string; to: string }): Promise<InsightRow[]>;
```

Default range: last 30 days UTC date strings.

- [ ] **Step 1: `sync-insights.ts`**

Require `adAccountId` from config; else return clear error “Thiếu FACEBOOK_AD_ACCOUNT_ID”.  
Call:

`GET /{adAccountId}/insights` with  
`level=campaign`,  
`time_increment=1`,  
`time_range={"since":"...","until":"..."}`,  
`fields=campaign_id,campaign_name,spend,impressions,clicks,reach,actions,cpc,cpm,ctr,cost_per_action_type`  

Parse `actions` / `cost_per_action_type` for lead-related action types when present (`lead`, `onsite_conversion.messaging_lead`, etc.) — if absent leave `leads` / `costPerLead` null.

Upsert on `(level, objectId, dateStart)`.

- [ ] **Step 2: `insights-repo.ts`**

List campaign-level rows for range; aggregate totals for KPI (sum spend/impressions/clicks/leads only over non-null numbers — do not coerce null to 0 in display; for sum, treat null as skip).

- [ ] **Step 3: Marketing page**

- ADMIN gate (redirect non-admin to `/leads`)  
- Empty state: “Chưa có dữ liệu Insights — bấm Đồng bộ”  
- KPI: Spend, Impressions, Clicks, Leads (from DB)  
- Table: date, campaign, spend, impressions, clicks, leads, CPL  
- Button sync insights  
- No mock charts

- [ ] **Step 4: Nav**

Add `{ href: "/marketing", label: "Marketing", icon: Megaphone, adminOnly: true }` next to Tài khoản.

- [ ] **Step 5: Settings also expose Insights sync button**

- [ ] **Step 6: Manual check + commit**

```bash
git add src/lib/facebook/sync-insights.ts src/lib/db/insights-repo.ts src/app/marketing/ src/components/marketing/ src/components/layout/app-shell.tsx src/app/settings/
git commit -m "feat(marketing): sync Meta insights and Marketing page"
```

---

### Task 7: Seed catalogs-only + UI “Chưa phân bổ” polish + docs

**Files:**
- Modify: `scripts/seed.ts` — stop inserting demo leads/logs (or gate behind `SEED_DEMO_LEADS=1`)
- Modify: `package.json` — optional `db:seed:demo`
- Modify: lead table/detail empty displays for null brand
- Modify: `README.md` — Facebook env + sync steps; warn rotate token
- Ensure `.env.local` has keys (user pastes secrets locally — agent must not commit `.env.local`)

- [ ] **Step 1: Change seed default to catalogs only**

Keep showrooms, users, sales rooms, car models.  
Skip `generateDemoData` lead insert unless env `SEED_DEMO_LEADS=1`.

- [ ] **Step 2: UI polish**

Any cell showing brand/showroom: if null/sentinel → “Chưa phân bổ”.  
Filters: allow empty brand without crashing.

- [ ] **Step 3: README section**

Document Phase A/B sync, required Meta permissions (`pages_manage_ads`, `pages_read_engagement`, `leads_retrieval`, `ads_read`), and token rotation.

- [ ] **Step 4: Full verification**

```bash
pnpm test
pnpm typecheck
pnpm build
```

Manual: purge → sync leads → sync insights → `/marketing` + `/leads`.

- [ ] **Step 5: Commit**

```bash
git add scripts/seed.ts package.json README.md src/
git commit -m "chore: catalogs-only seed and Facebook integration docs"
```

---

## Spec coverage checklist

| Spec item | Task |
| --- | --- |
| Nullable showroom/sales/brand | 1 |
| Meta lead id columns | 1 |
| `meta_ad_insights` / `meta_sync_runs` | 1, 4, 6 |
| Graph thin client | 3 |
| field_data mapper + skip no phone | 2, 4 |
| ADMIN sync leads | 4, 5 |
| Purge sample leads | 4, 5 |
| Settings UI | 5 |
| Insights sync | 6 |
| `/marketing` page | 6 |
| No fake CPL on leads | 4 |
| Seed without demo leads | 7 |
| Env example + rotate token note | 3, 7 |
| Webhook | Out of scope |

## Plan self-review notes

- No webhook tasks included (correct).
- `cost_per_lead` on lead rows not filled by sync (correct per prefer).
- Ad account required only in Task 6.
- Vitest added because repo had no test runner.
