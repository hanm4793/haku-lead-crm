# Projects UX split + multi-membership

## IA
- `/settings` — app-wide only (AI, Facebook token/sync, auth)
- `/projects` — table list (search/filter)
- `/projects/[id]` — tabs: Overview, Fanpages, Ads, Partners, Catalog, Attr fields

## Membership
- `project_members (project_id, user_id)` unique — partner (and optionally staff) ↔ many projects
- Backfill from `app_users.project_id`
- Super admin: all projects + switcher
- Partner: switcher = memberships; staff inherit partner’s memberships
- `app_users.project_id` kept as legacy fallback until fully unused; resolveActiveProject uses memberships first

## Permissions
- Create project / assign partners & pages & ads: Super admin
- Partner: open own projects; manage catalog + attr fields on those projects
