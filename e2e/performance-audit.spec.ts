import { expect, test } from "@playwright/test";

const PERF_ROUTES = [
  "/login",
  "/leads",
  "/reports",
  "/marketing",
  "/projects",
  "/users",
  "/settings",
  "/account",
] as const;

type PerfMetrics = {
  route: string;
  ttfbMs: number;
  domContentLoadedMs: number;
  loadMs: number;
  fcpMs: number;
  lcpMs: number;
  cls: number;
  domNodes: number;
  jsTransferKb: number;
  totalTransferKb: number;
  requestCount: number;
};

test.describe("Performance & Core Web Vitals Audit", () => {
  test.use({ viewport: { width: 1440, height: 900 } });

  test("measure Web Vitals and resource budgets across all routes", async ({ page }) => {
    const results: PerfMetrics[] = [];

    for (const route of PERF_ROUTES) {
      await page.addInitScript(() => {
        const win = window as unknown as {
          __e2eLcp?: number;
          __e2eCls?: number;
        };
        win.__e2eLcp = 0;
        win.__e2eCls = 0;

        try {
          new PerformanceObserver((list) => {
            const entries = list.getEntries();
            const last = entries[entries.length - 1];
            if (last) win.__e2eLcp = last.startTime;
          }).observe({ type: "largest-contentful-paint", buffered: true });
        } catch {
          // Ignore unsupported browser API
        }

        try {
          new PerformanceObserver((list) => {
            for (const entry of list.getEntries()) {
              const shift = entry as PerformanceEntry & { hadRecentInput?: boolean; value?: number };
              if (!shift.hadRecentInput && typeof shift.value === "number") {
                win.__e2eCls = (win.__e2eCls ?? 0) + shift.value;
              }
            }
          }).observe({ type: "layout-shift", buffered: true });
        } catch {
          // Ignore unsupported browser API
        }
      });

      const response = await page.goto(route, { waitUntil: "networkidle" });
      expect(response?.status(), `HTTP status for ${route}`).toBeLessThan(400);
      await page.waitForTimeout(400);

      const metrics = await page.evaluate((currentRoute): PerfMetrics => {
        const win = window as unknown as { __e2eLcp?: number; __e2eCls?: number };
        const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
        const paints = performance.getEntriesByType("paint");
        const fcpEntry = paints.find((p) => p.name === "first-contentful-paint");
        const resources = performance.getEntriesByType("resource") as PerformanceResourceTiming[];

        let jsBytes = 0;
        let totalBytes = 0;
        for (const r of resources) {
          const size = r.transferSize || r.encodedBodySize || 0;
          totalBytes += size;
          if (r.initiatorType === "script" || r.name.endsWith(".js")) {
            jsBytes += size;
          }
        }

        return {
          route: currentRoute,
          ttfbMs: Math.round(nav ? nav.responseStart - nav.requestStart : 0),
          domContentLoadedMs: Math.round(nav ? nav.domContentLoadedEventEnd : 0),
          loadMs: Math.round(nav ? nav.loadEventEnd : 0),
          fcpMs: Math.round(fcpEntry ? fcpEntry.startTime : 0),
          lcpMs: Math.round(win.__e2eLcp ?? 0),
          cls: Number((win.__e2eCls ?? 0).toFixed(4)),
          domNodes: document.querySelectorAll("*").length,
          jsTransferKb: Math.round(jsBytes / 1024),
          totalTransferKb: Math.round(totalBytes / 1024),
          requestCount: resources.length,
        };
      }, route);

      results.push(metrics);
    }

    console.log("\n=== PERFORMANCE AUDIT SUMMARY ===");
    console.table(results);

    for (const r of results) {
      // CLS < 0.1 theo chuẩn Core Web Vitals "Good"
      expect(r.cls, `CLS on ${r.route}`).toBeLessThan(0.1);
      // DOM không phình quá lớn
      expect(r.domNodes, `DOM nodes on ${r.route}`).toBeLessThan(5000);
      // LCP trong môi trường local dưới 4s
      expect(r.lcpMs, `LCP on ${r.route}`).toBeLessThan(4000);
    }
  });
});
