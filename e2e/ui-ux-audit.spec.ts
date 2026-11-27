import { expect, test, type Page } from "@playwright/test";

const ROUTES = [
  { path: "/login", name: "Login", hasShell: false },
  { path: "/leads", name: "Leads", hasShell: true },
  { path: "/reports", name: "Reports", hasShell: true },
  { path: "/marketing", name: "Marketing", hasShell: true },
  { path: "/projects", name: "Projects", hasShell: true },
  { path: "/users", name: "Users", hasShell: true },
  { path: "/settings", name: "Settings", hasShell: true },
  { path: "/account", name: "Account", hasShell: true },
] as const;

const VIEWPORTS = [
  { label: "desktop", width: 1440, height: 900 },
  { label: "tablet", width: 820, height: 1180 },
  { label: "mobile", width: 390, height: 844 },
] as const;

type AuditFinding = {
  route: string;
  viewport: string;
  horizontalOverflowPx: number;
  brokenImages: string[];
  smallInputsOnMobile: Array<{ tag: string; type: string; placeholder: string; fontSize: number }>;
  unlabeledIconButtons: Array<{ html: string; rect: string }>;
  tinyMobileTargets: Array<{ label: string; width: number; height: number }>;
  duplicateIds: string[];
  hasMainLandmark: boolean;
  pageTitle: string;
};

async function collectDomAudit(page: Page, route: string, viewport: string): Promise<AuditFinding> {
  return page.evaluate(
    ({ routeName, viewportName }) => {
      const overflow = Math.max(0, document.documentElement.scrollWidth - window.innerWidth);

      const brokenImages: string[] = [];
      for (const img of Array.from(document.querySelectorAll("img"))) {
        const style = window.getComputedStyle(img);
        const rect = img.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0) continue;
        if (!img.complete || img.naturalWidth === 0) {
          brokenImages.push(img.getAttribute("src") || img.alt || "<img without src>");
        }
      }

      const smallInputsOnMobile: AuditFinding["smallInputsOnMobile"] = [];
      if (viewportName === "mobile") {
        const inputs = document.querySelectorAll(
          'input:not([type="checkbox"]):not([type="radio"]):not([type="hidden"]):not([type="file"]), textarea, select',
        );
        for (const el of Array.from(inputs)) {
          const style = window.getComputedStyle(el);
          const rect = el.getBoundingClientRect();
          if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
            continue;
          }
          const fontSize = parseFloat(style.fontSize);
          if (fontSize < 16) {
            smallInputsOnMobile.push({
              tag: el.tagName.toLowerCase(),
              type: el.getAttribute("type") || "",
              placeholder: el.getAttribute("placeholder") || "",
              fontSize,
            });
          }
        }
      }

      const unlabeledIconButtons: AuditFinding["unlabeledIconButtons"] = [];
      const tinyMobileTargets: AuditFinding["tinyMobileTargets"] = [];
      const interactiveEls = document.querySelectorAll("button, a[href], [role='button']");
      for (const el of Array.from(interactiveEls)) {
        if (el.closest('[aria-hidden="true"], [inert]')) continue;
        const style = window.getComputedStyle(el);
        const rect = el.getBoundingClientRect();
        if (style.display === "none" || style.visibility === "hidden" || rect.width === 0 || rect.height === 0) {
          continue;
        }
        const text = (el.textContent || "").replace(/\s+/g, " ").trim();
        const ariaLabel = el.getAttribute("aria-label")?.trim() || "";
        const ariaLabelledBy = el.getAttribute("aria-labelledby")?.trim() || "";
        const title = el.getAttribute("title")?.trim() || "";
        if (el.tagName === "BUTTON" && !text && !ariaLabel && !ariaLabelledBy && !title) {
          unlabeledIconButtons.push({
            html: el.outerHTML.slice(0, 140),
            rect: `${Math.round(rect.width)}x${Math.round(rect.height)}`,
          });
        }
        if (viewportName === "mobile" && (rect.width < 32 || rect.height < 32)) {
          const isInTable = Boolean(el.closest("table"));
          if (!isInTable) {
            tinyMobileTargets.push({
              label: (text || ariaLabel || title || el.tagName).slice(0, 40),
              width: Math.round(rect.width),
              height: Math.round(rect.height),
            });
          }
        }
      }

      const idCounts = new Map<string, number>();
      for (const el of Array.from(document.querySelectorAll("[id]"))) {
        const id = el.id;
        if (!id || id.startsWith("radix-") || id.startsWith("_R_")) continue;
        idCounts.set(id, (idCounts.get(id) ?? 0) + 1);
      }
      const duplicateIds = Array.from(idCounts.entries())
        .filter(([, count]) => count > 1)
        .map(([id]) => id);

      return {
        route: routeName,
        viewport: viewportName,
        horizontalOverflowPx: overflow,
        brokenImages,
        smallInputsOnMobile,
        unlabeledIconButtons,
        tinyMobileTargets,
        duplicateIds,
        hasMainLandmark: Boolean(document.querySelector("main")),
        pageTitle: document.title,
      };
    },
    { routeName: route, viewportName: viewport },
  );
}

test.describe("UI/UX Full Route & Responsive Audit", () => {
  for (const vp of VIEWPORTS) {
    test.describe(`${vp.label} (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const route of ROUTES) {
        test(`${route.name} (${route.path}) — runtime, layout, a11y`, async ({ page }) => {
          const pageErrors: string[] = [];
          const consoleErrors: string[] = [];
          const failedRequests: string[] = [];

          page.on("pageerror", (err) => pageErrors.push(err.message));
          page.on("console", (msg) => {
            if (msg.type() === "error") {
              consoleErrors.push(msg.text());
            }
          });
          page.on("response", (res) => {
            if (res.status() >= 400 && !res.url().includes("favicon")) {
              failedRequests.push(`${res.status()} ${res.url()}`);
            }
          });

          const response = await page.goto(route.path, { waitUntil: "networkidle" });
          expect(response?.status(), `HTTP status on ${route.path}`).toBeLessThan(400);

          // Đợi layout ổn định và Recharts/animations mount
          await page.waitForTimeout(300);

          const audit = await collectDomAudit(page, route.path, vp.label);

          if (audit.tinyMobileTargets.length > 0) {
            console.warn(
              `[AUDIT WARNING] ${route.path} (${vp.label}) tiny touch targets (<32px):`,
              JSON.stringify(audit.tinyMobileTargets.slice(0, 10)),
            );
          }

          expect(pageErrors, `Uncaught page errors on ${route.path}`).toEqual([]);
          expect(consoleErrors, `Console errors on ${route.path}`).toEqual([]);
          expect(failedRequests, `Failed HTTP responses on ${route.path}`).toEqual([]);
          expect(audit.pageTitle.trim().length, `Non-empty <title> on ${route.path}`).toBeGreaterThan(0);
          expect(audit.horizontalOverflowPx, `Horizontal overflow on ${route.path} (${vp.label})`).toBe(0);
          expect(audit.brokenImages, `Broken images on ${route.path}`).toEqual([]);
          expect(audit.smallInputsOnMobile, `iOS auto-zoom inputs (<16px) on ${route.path}`).toEqual([]);
          expect(audit.unlabeledIconButtons, `Icon-only buttons without aria-label on ${route.path}`).toEqual([]);
          expect(audit.duplicateIds, `Duplicate DOM IDs on ${route.path}`).toEqual([]);

          if (route.hasShell) {
            expect(audit.hasMainLandmark, `<main> landmark on ${route.path}`).toBe(true);
          }
        });
      }
    });
  }
});
