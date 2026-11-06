---
name: crm-ui-ux-pro
description: >-
  Specialized UI/UX engineering system for B2B SaaS & CRM web/mobile applications
  (Desktop high-density workspaces, Tablet adaptive rails, and Native-feel Mobile PWA).
  Use this skill whenever designing, auditing, refactoring, or building layouts, navigation,
  tables, mobile cards, sheets/drawers, forms, charts, or micro-interactions in this CRM project.
---

# CRM UI/UX Pro — Desktop Command Center & Native Mobile App System

This skill combines three industry-leading UI/UX standards tailored specifically for **SEMTOP / Haku Lead CRM** (Next.js App Router + React 19 + Tailwind CSS v4 + Radix UI):

1. **High-Velocity Desktop B2B CRM** (inspired by *Linear*, *Attio*, *Modern HubSpot*) — scannable data density, sticky table columns, inline editing, slide-over drawers, and unified workspace context.
2. **Native-Feel Mobile & Tablet App Experience** (inspired by *Apple HIG* & *Material Design 3*) — `100dvh` dynamic viewport, safe-area insets, thumb-zone Bottom Tab Bar, Bottom Sheets instead of centered modals, and stacked mobile cards with 1-tap Call/Zalo actions.
3. **Web Interface Engineering Rigor** (synthesized from *Vercel Web Interface Guidelines* & *WCAG AA*) — `touch-action: manipulation`, `tabular-nums`, `:focus-visible`, 16px mobile input zoom prevention, scroll containment, and GPU-only animations.

---

## Mandatory Project Guardrails (`AGENTS.md`)

Before modifying any navigation item, page, action, or visibility logic:
- **Never hardcode `role === ...` checks scattered across UI components.** Always use helper functions from `src/lib/auth/roles.ts` (`canSeeNav`, `canUseAi`, `canCreateLead`, `canEditLead`, `canAssignLead`, etc.).
- **Hiding UI is never a substitute for server enforcement.** Keep all server-side `dataScope` / `isPageVisible` / role guards intact.
- Consult `node_modules/next/dist/docs/` whenever touching Next.js App Router conventions (`viewport`, `manifest.ts`, `metadata`, route segments).

---

## Progressive Reference Guides

Load the relevant reference file below before implementing changes in that domain:

- **[Desktop B2B CRM Patterns](./references/desktop-b2b-crm.md)** — App shell, unified top context bar, high-density data tables, sticky columns, toolbar hierarchy, KPI cards, and slide-over detail drawers.
- **[Native-Feel Mobile & Tablet PWA](./references/mobile-native-pwa.md)** — Viewport & PWA setup (`100dvh`, `safe-area-inset`), Mobile Bottom Tab Bar + "More" sheet, Tablet navigation rail, Bottom Sheet dialogs/filters, and Mobile Lead Card anatomy.
- **[Interface Engineering & Audit Checklist](./references/interface-audit-checklist.md)** — Typography (`tabular-nums`), touch ergonomics (`>= 44px`, `touch-action`), iOS Safari 16px input rule, `overscroll-behavior`, hover-less touch fallbacks, and animation rules.

---

## Execution Workflow

1. **Audit Across 3 Breakpoints**:
   - **Mobile (`< 768px`, `max-md`)**: Thumb-driven single column, Bottom Tab Bar, stacked entity cards, Bottom Sheets, sticky compact filter chips, zero horizontal page overflow.
   - **Tablet (`768px – 1023px`, `md` to `lg`)**: Collapsible `64px` icon rail, 2–3 column KPI grids, adaptive drawers, touch-sized table/action controls (`>= 40px`).
   - **Desktop (`>= 1024px`, `lg+`)**: Expandable sidebar (`240px` / `68px`), sticky table columns, inline cell editors, keyboard shortcuts (`/` search, `Esc` close, `Cmd/Ctrl+S` save), hover enhancements with touch fallbacks.
2. **Verify Permissions & Data Scope**: Confirm all role gates in `src/lib/auth/roles.ts` behave identically across Desktop sidebar and Mobile bottom nav/sheets.
3. **Run Quality Gates**:
   - Execute `pnpm typecheck` and `pnpm test` to ensure zero regressions.
   - Walk through [Interface Audit Checklist](./references/interface-audit-checklist.md) on every modified file.
