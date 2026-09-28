<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Phân quyền

Mọi tính năng mới (trang, API, server action, mục menu, câu hỏi AI) phải gắn quyền trước khi coi là xong. Quy tắc và bảng quyền nằm ở `docs/permissions.md`.

- Dùng hàm trong `src/lib/auth/roles.ts`. Không so sánh `role` rải trong UI.
- Chặn ở server. Ẩn menu không thay cho bước đó.
- Dữ liệu lead, báo cáo, marketing và AI lọc bằng `dataScope` / `isPageVisible`.
- Thêm một dòng vào bảng trong `docs/permissions.md` và một case trong `src/lib/auth/roles.test.ts`.
