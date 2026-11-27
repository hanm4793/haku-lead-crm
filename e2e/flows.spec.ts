import { expect, test } from "@playwright/test";

test.describe("Core CRM Interactive E2E Flows", () => {
  test("Desktop: Leads search, detail drawer open/close, and create modal", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/leads", { waitUntil: "networkidle" });

    // Kiểm tra có ô tìm kiếm và bảng dữ liệu
    const searchInput = page.locator('input[placeholder*="Tìm"]:visible').first();
    await expect(searchInput).toBeVisible();

    await searchInput.fill("Nguyễn");
    await page.waitForTimeout(350);
    await searchInput.fill("");
    await page.waitForTimeout(350);

    // Mở chi tiết lead đầu tiên nếu có dòng trong bảng
    const firstRow = page.locator("tbody tr").first();
    if ((await firstRow.count()) > 0) {
      await firstRow.click();
      const dialog = page.locator('[role="dialog"]').first();
      await expect(dialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeHidden();
    }

    // Kiểm tra nút Thêm lead
    const addLeadBtn = page.getByRole("button", { name: /Thêm lead/i }).first();
    if ((await addLeadBtn.count()) > 0 && (await addLeadBtn.isVisible())) {
      await addLeadBtn.click();
      const createDialog = page.locator('[role="dialog"]').first();
      await expect(createDialog).toBeVisible();
      await page.keyboard.press("Escape");
      await expect(createDialog).toBeHidden();
    }
  });

  test("Desktop: Reports charts render with non-zero SVG dimensions", async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto("/reports", { waitUntil: "networkidle" });
    await page.waitForTimeout(500);

    // Kiểm tra Recharts SVG biểu đồ chính render có kích thước thực (loại trừ icon legend 8x8)
    const chartSizes = await page.locator(".recharts-wrapper > svg.recharts-surface").evaluateAll((svgs) =>
      svgs.map((el) => {
        const rect = el.getBoundingClientRect();
        return { width: Math.round(rect.width), height: Math.round(rect.height) };
      }),
    );
    expect(chartSizes.length).toBeGreaterThan(0);
    expect(chartSizes.some((s) => s.width > 100 && s.height > 80)).toBe(true);
  });

  test("Mobile: Bottom navigation works cleanly with zero overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/leads", { waitUntil: "networkidle" });

    const mobileNav = page.locator("nav").last();
    await expect(mobileNav).toBeVisible();

    // Chuyển sang Báo cáo qua bottom nav
    const reportsLink = page.locator('a[href="/reports"]').last();
    await expect(reportsLink).toBeVisible();
    await reportsLink.click();
    await page.waitForURL("**/reports");
    await page.waitForLoadState("networkidle");

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBe(0);
  });
});
