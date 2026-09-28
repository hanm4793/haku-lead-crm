# SEMTOP Marketing CRM — Rebrand & UI Design

**Date:** 2026-09-28  
**Branch:** `feature/facebook-sync`  
**Status:** Approved to implement (user: review after)

## Decisions

- Product name: **SEMTOP Marketing CRM**
- Logo: Semtop white logo (`logo-white.png`)
- Visual: **primary = Semtop blue**; **red only** for logo + destructive (avoid dual red/blue UI)
- Font: Plus Jakarta Sans (UI)
- Approach: token-first design system, then pages inherit
- B10: **full removal** — UI, filters, AI, types, **and DB columns** via migration
- Keep Facebook sync / Marketing / Fanpage filter

## Out of scope this pass

- Merging to `main`
- New CRM features beyond rebrand / B10 removal / UI polish
- Making phone nullable in DB (empty string remains)

## Done vs later (docs target)

**Done / in this change:** Semtop brand, design tokens, B10 gone, date picker polish, docs refresh.  
**Later:** field_data JSONB, form-type mapping table, webhook Facebook, etc.
