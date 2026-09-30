# Projects UX + multi-membership

**Status: đã ship.** Chi tiết quyền: `docs/permissions.md`.

## IA

- `/settings` — app-wide: AI, Facebook token/sync, auth (chỉ Super admin)
- `/projects` — danh sách
- `/projects/[id]` — Overview, Fanpages, Ads, Partners, Catalog, Attr fields

## Membership

- `project_members (project_id, user_id)` — partner (và staff kế thừa partner) thuộc nhiều project
- Cookie `semtop_project_id` = project đang xem
- Super admin: mọi project + switcher
- Partner: switcher theo membership (kể cả 1 project)
- Staff: switcher khi > 1 membership (kế thừa partner)
- `app_users.project_id` còn fallback; `resolveActiveProject` ưu tiên membership

## Quyền quản lý

- Tạo project, gán page / partner / ads: Super admin (`canManageProjects`)
- Partner: xem project là thành viên; sửa catalog + attr fields trên project đó
