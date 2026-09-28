# Catalog dimensions (Phase B)

## Goal

Replace auto-only catalogs (`brand` enum, `showrooms`, `car_models`) with a multi-industry model:

- **Project** — one active project configures UI labels
- **3 catalogs** — `brands`, `products`, `locations`
- **`leads.attrs` JSONB** — leftover / industry-specific fields
- **Admin CRUD** — super admin manages catalogs in Settings
- **`sales_rooms` removed** — không còn dùng trong CRM generic (assignee + location đủ)

## Data model

| Old | New |
| --- | --- |
| `brand` enum on leads / car_models | `brands` table; `leads.brand_id` |
| `car_models` | `products` (`brand_id` + `project_id`) |
| `showrooms` | `locations` (`project_id`) |
| `sales_rooms` / `leads.sales_room_id` | **dropped** |
| — | `projects` with `brand_label`, `product_label`, `location_label` |
| — | `leads.attrs jsonb` default `{}` |
| `app_users.showroom_id` | `app_users.location_id` |

Seed project: `semtop-auto` with labels Thương hiệu / Dòng xe / Showroom.

## Runtime

- Phase B uses **one default project** (no project switcher).
- UI labels come from `getCatalogLabels(project)`.
- Dropdowns come from DB via `getReferenceData()`, not hard-coded brand/model lists.
- Facebook sync maps known fields to the three dimensions; remainder goes into `attrs`.
- Lead detail shows `attrs` read-only.

## Permissions

Catalog CRUD = Super admin only (`canManageCatalogs` / reuse settings gate). Documented in `docs/permissions.md`.

## Out of scope

- Multi-project UI / fanpage↔project mapping
- Attrs form builder
