# Docs — đọc gì khi tiếp tục code

Chỉ giữ file còn đúng với code. Spec/plan cũ (Facebook skip SĐT, role ADMIN, 1 project, Partner không switcher) **đã xóa**.

## Thứ tự đọc (AI mới)

1. `README.md` — stack, chạy local, phạm vi đã ship
2. `docs/permissions.md` + `src/lib/auth/roles.ts` + `src/lib/auth/roles.test.ts`
3. `AGENTS.md` — rule Next.js + bắt buộc gắn quyền
4. `docs/superpowers/specs/2026-09-28-projects-ux-design.md` — IA `/projects` vs `/settings`, membership
5. `docs/superpowers/specs/2026-09-28-attr-fields-design.md` — field phụ theo project
6. `docs/reports-backlog.md` — việc Báo cáo **chưa** làm
7. Code theo tính năng: `src/lib/db/schema.ts` → page/API tương ứng

Không implement lại từ file đã xóa. Quyền lấy từ `roles.ts`, không copy bảng cũ trong spec Facebook.
