# Desktop B2B CRM UI/UX Patterns (Attio / Linear Standard)

## 1. App Shell & Workspace Context
- **Sidebar Discipline**:
  - Desktop (`>= 1024px`): Left sidebar `w-60` expanded or `w-[4.25rem]` collapsed. Avoid animating layout `width` if it triggers heavy table reflows, or keep duration crisp (`150ms–200ms ease-out`).
  - Active item must have high contrast (`bg-sidebar-accent text-white shadow-xs`) and clear icon-label alignment; collapsed mode must provide instant tooltips (`delayDuration={150}`).
- **Unified Top Context Bar**:
  - Users in multi-project CRMs must always know *which project* and *which module* they are viewing.
  - Keep global context controls (`ProjectSwitcher`, sync status pill, quick AI trigger) consistently positioned rather than jumping around per page.
- **Vertical Space Optimization**:
  - Full-viewport workspace screens (`/leads`) must maximize vertical rows visible above the fold. Avoid redundant global footers on fixed-height data-grid views; use `h-dvh` / flex-1 layouts cleanly.

## 2. High-Velocity Data Tables (`LeadTable` & `DataTable`)
- **Typography & Numeric Alignment**:
  - Every numeric column (`#`, phone numbers, counts, currency, CPL, CTR, timestamps, percentages) MUST apply `tabular-nums` (`font-variant-numeric: tabular-nums`).
  - Primary identifier (`name`) uses `font-semibold text-slate-900`; secondary metadata uses `text-slate-600`; empty values use a muted em-dash (`—` in `text-slate-300`).
- **Sticky Identifier Columns**:
  - When a table scrolls horizontally across 10+ CRM & custom `attr:*` columns, keep the selection checkbox and primary Lead Name/Phone column `sticky left-0 z-10` with a subtle right separator shadow when scrolled.
  - Keep `thead` `sticky top-0 z-20` with crisp hairline bottom border (`border-b border-border bg-slate-50/95 backdrop-blur-xs`).
- **Row States & Inline Editing**:
  - Row states must layer cleanly without clashing: default -> hover (`hover:bg-primary/[0.035]`) -> overdue warning (`bg-amber-50/45`) -> selected (`bg-primary/[0.07]`).
  - Inline action buttons (Call, Copy, Zalo) inside cells must have generous hit areas (`p-1.5 -m-1 rounded-md`) so mouse users don't mis-click and trigger `onRowClick`.

## 3. Toolbar & Filter Ergonomics
- **Visual Hierarchy (Left-to-Right)**:
  1. **Left**: Primary search input (`/` shortcut hint) + quick status segment/dropdown + date range + filter popover.
  2. **Active Filter Feedback**: Show active filter count badge clearly and provide a 1-click `Xóa lọc` ghost button in rose/muted tone whenever filters are active.
  3. **Right**: View customization (Column visibility, Refresh timestamp) -> Secondary actions (Import/Export Excel) -> Single high-emphasis Primary CTA (`+ Tạo lead mới`).
- **Bulk Selection Bar**:
  - When `selectedIds.length > 0`, surface a high-clarity contextual bar (or floating command bar) showing exact count, `Bỏ chọn`, Assignee dropdown, Round-Robin button, and Bulk Status action.

## 4. Detail Views: Slide-Over Drawer vs. Centered Modal
- In CRM workflows, sales reps process leads sequentially (`Trước` / `Tiếp`).
- **Slide-Over Right Sheet (`lg+`)** or **Structured Split Header + Sticky Footer**:
  - Keep header (Name, Phone, 1-click Call/Zalo/Log Call, `Trước`/`Tiếp` navigation) pinned at top.
  - Keep Tab bar (`Xử lý & Chăm sóc`, `Bình luận`, `Form & Marketing`, `Nhật ký`) pinned below header.
  - Keep `Lưu thay đổi` (`Ctrl+S`) bar pinned at bottom whenever `dirty === true` (or always visible with clear saved/dirty indicator) so users never scroll hunting for the Save button.
