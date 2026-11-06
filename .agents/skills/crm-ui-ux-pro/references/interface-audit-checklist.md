# Interface Engineering & Audit Checklist (Vercel WIG + WCAG AA)

Run every modified component through this checklist before marking UI work complete:

## 1. Touch, Pointer & Mobile Safari Rules
- [ ] **No iOS Input Auto-Zoom**: Every `<input>`, `<textarea>`, and `<select>` on mobile (`< 768px`) MUST render at `font-size >= 16px` (`text-base md:text-sm` or `max-md:text-base`). Font sizes `< 16px` cause iOS Safari to jarringly zoom the viewport on focus!
- [ ] **Zero 300ms Tap Delay**: Interactive buttons, links, tabs, and cards include `touch-action: manipulation`.
- [ ] **Minimum Hit Targets**: Touch targets on mobile/tablet (`pointer: coarse`) are at least `40x40px` (ideally `44x44px`), with `>= 8px` spacing between destructive and frequent actions.
- [ ] **No Hover-Only Controls**: Any button using `opacity-0 group-hover:opacity-100` (e.g., AI chat copy button, table quick actions) MUST remain visible on touch devices (`max-md:opacity-100` or `@media (hover: none)`).
- [ ] **Tactile Active States**: Primary interactive controls and mobile cards provide instant `:active` visual feedback (`active:scale-[0.98]` or `active:bg-accent`) so taps never feel dead.

## 2. Scroll, Viewport & Layout Stability
- [ ] **Dynamic Viewport**: Zero instances of `100vh` or `h-screen` on mobile-visible containers — replaced with `100dvh` / `h-dvh` / `min-h-dvh`.
- [ ] **Scroll Containment**: Scrollable modals, sheets, sidebars, and popovers use `overscroll-behavior: contain` (`overscroll-contain`) so scrolling inside a sheet never scrolls the page behind it.
- [ ] **No Horizontal Bleed**: Fixed-width controls (`w-48`, `w-60`, `min-w-[400px]`) adapt gracefully (`w-full sm:w-48`, `max-w-[calc(100vw-2rem)]`) with zero horizontal overflow at `320px–390px` viewport widths.
- [ ] **Safe Area Padding**: Sticky bottom elements (Bottom Nav, Sheet footers, AI Chat input bar, Toast container) clear the iPhone Home Indicator via `env(safe-area-inset-bottom)`.

## 3. Typography, Forms & Accessibility
- [ ] **Tabular Numerals**: All KPIs, badge counts, phone numbers, dates, prices, CPL, CTR, and pagination numbers use `tabular-nums`.
- [ ] **Keyboard & Focus**: Focus rings use `:focus-visible` (`focus-visible:ring-2`), never bare `:focus`. Icon-only buttons always have `aria-label` or `<span className="sr-only">`.
- [ ] **Semantic Input Attributes**: Phone inputs use `inputMode="tel"`, email inputs `type="email" autoComplete="email"`, search inputs `type="search"` or clear button with `aria-label`.
- [ ] **Loading & Optimistic Feedback**: Buttons in pending state disable duplicate clicks, show `<Loader2 className="animate-spin" />`, and preserve readable label width without layout shift.

## 4. Performance & Motion
- [ ] **GPU-Composited Motion Only**: Animate `transform` and `opacity` — avoid `transition-all`.
- [ ] **Reduced Motion Respect**: Honor `@media (prefers-reduced-motion: reduce)` globally in `globals.css`.
