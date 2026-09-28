# SEMTOP Rebrand + B10 Removal + UI System — Plan

> **For agentic workers:** token-first brand → B10 drop → calendar polish → docs. Branch: `feature/facebook-sync`.

**Goal:** Ship Semtop Marketing CRM look, remove B10 completely, polish date UI, refresh docs.

**Done when:** App shows Semtop logo/name; no B10 UI/filters/columns; migration drops B10 columns; date picker uses calendar; README lists done/todo.

## Tasks

### T1 — Brand tokens + shell + login
- `globals.css`, `layout.tsx` (Plus Jakarta Sans), `app-shell.tsx`, `login/page.tsx`, metadata titles, `/public/brand/logo-white.png`

### T2 — Drop B10
- Types, schema, migration `0006_drop_b10.sql`, filters/repo/AI/UI

### T3 — Date picker / calendar
- `components/ui/calendar.tsx` + `date-range-picker.tsx` (react-day-picker)

### T4 — Docs
- README + this plan + design spec

## Test
- `pnpm typecheck`
- `pnpm db:migrate` (local)
- Manual: login, leads filter dates, no B10 in filter/detail, Marketing nav, Semtop sidebar
