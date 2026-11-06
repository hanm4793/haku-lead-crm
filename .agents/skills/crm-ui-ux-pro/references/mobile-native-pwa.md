# Native-Feel Mobile & Tablet PWA Guidelines (iOS HIG + Material 3)

## 1. Viewport, PWA Standalone & Safe Areas
- **Dynamic Viewport (`dvh`)**:
  - NEVER use `100vh` or `h-screen` for mobile app shells, drawers, or fixed-height pages. Mobile browser URL/toolbars dynamically resize; always use `min-h-dvh` / `h-dvh`.
- **Safe Area Insets (`viewportFit: "cover"`)**:
  - Export `viewport: Viewport` in `src/app/layout.tsx` with `width: "device-width"`, `initialScale: 1`, `viewportFit: "cover"`, and `themeColor: "#102a6b"`.
  - Provide `src/app/manifest.ts` with `display: "standalone"` so adding to iOS/Android Home Screen launches SEMTOP CRM like a true native app without browser chrome.
  - Apply `pb-[env(safe-area-inset-bottom)]` on Bottom Tab Bars and Bottom Sheet footers, and `pt-[env(safe-area-inset-top)]` on standalone top bars.

## 2. Responsive Navigation Architecture
- **Mobile (`< 768px`) — Zero Left Sidebar!**:
  - Never render a `68px` collapsed icon sidebar on phones — it steals ~18% of horizontal width and breaks native mental models.
  - **Mobile Top App Bar (`h-13` / `52px`, sticky top-0)**: Brand mark / Page title on left, compact `ProjectSwitcher` in center/right, AI Assistant sparkle button & Avatar/Account trigger on right.
  - **Mobile Bottom Tab Bar (`fixed bottom-0 inset-x-0 z-40`)**:
    - Frosted glass surface (`bg-card/92 backdrop-blur-md border-t border-border`).
    - 4–5 primary tabs filtered strictly through `canSeeNav(user.role, item.access)` (e.g., `Lead`, `Báo cáo`, `Marketing` or `Dự án`, `AI`, `Thêm`).
    - Each tab target >= `48px` tall, icon `size-5`, label `text-[10.5px] font-medium`, active indicator pill/tint, instant `:active` press feedback (`active:scale-95`).
    - Overflow destinations (`Người dùng`, `Cài đặt App`, `Tài khoản`, `Đăng xuất`) open cleanly inside a **Bottom Action Sheet ("Menu / Thêm")**.
- **Tablet (`768px – 1023px`) — Navigation Rail**:
  - Show collapsible `64px–68px` left icon rail (`md:flex`), expanding as an overlay drawer when toggled so main content doesn't violently reflow on narrow iPads.

## 3. Bottom Sheets Instead of Centered Modals (`< 768px`)
- Centered modals with tiny `X` buttons in the top-right corner are hostile to one-handed thumb usage and break when the virtual keyboard opens.
- **Mobile Sheet Pattern**:
  - Anchor to bottom (`inset-x-0 bottom-0 max-h-[92dvh] rounded-t-2xl`), slide up smoothly (`slide-in-from-bottom`), include a top visual drag indicator (`h-1.5 w-10 rounded-full bg-slate-300 mx-auto`).
  - Apply `overscroll-behavior: contain` on the sheet body scroll container.
  - Apply to: **Lead Detail**, **Create Lead**, **Filter Popover**, **Date Range Picker**, **Column Visibility**, and **AI Chat Panel** (full-width `100dvh` sheet on mobile).

## 4. Data-Dense Tables -> Mobile Stacked Cards
- Never force horizontal scrolling across a 12-column table as the primary mobile Lead workflow.
- **Mobile Lead Card Anatomy**:
  - **3px Left Stage Accent Bar**: Semantic color stripe (`emerald` for KHQT, `violet` for KHD, `blue` for GDTD, `amber` for Chưa LH được / Quá hạn, `rose` for Fail, `slate` for Chưa phân loại).
  - **Header Row**: Customer Name (`font-semibold text-[15px]`) + Category badge + Selection checkbox (or long-press/checkbox toggle).
  - **Sub-row**: Phone number (`tabular-nums font-medium`) · Brand/Product · Source/Fanpage · Timestamp/Overdue badge.
  - **Thumb Action Bar**: Dedicated `40px` touch-friendly quick actions right on the card:
    - `Gọi` (`<a href="tel:...">` in emerald tint)
    - `Zalo` (`https://zalo.me/...` in blue tint)
    - `Trạng thái / Phụ trách` quick selector
  - Tapping the card body opens the **Lead Detail Bottom Sheet**.
- **Floating Primary Action (FAB) & Sticky Filter Bar**:
  - Compact horizontal scroll strip for KPIs & Quick Status Chips (`Tất cả`, `Chưa LH`, `Đã LH`, `Quá hạn`) so the first Lead Card appears immediately in the upper half of the screen!
