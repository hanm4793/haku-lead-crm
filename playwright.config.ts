import { existsSync } from "node:fs";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.PLAYWRIGHT_PORT || 3100);
const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || `http://127.0.0.1:${PORT}`;
const hasProdBuild = existsSync(path.join(process.cwd(), ".next", "BUILD_ID"));
const useProdServer = hasProdBuild && process.env.PLAYWRIGHT_PROD === "1";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 45_000,
  expect: {
    timeout: 10_000,
  },
  reporter: [["list"], ["html", { open: "never", outputFolder: "playwright-report" }]],
  use: {
    baseURL: BASE_URL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    locale: "vi-VN",
    timezoneId: "Asia/Ho_Chi_Minh",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: process.env.PLAYWRIGHT_BASE_URL
    ? undefined
    : {
        command: useProdServer
          ? `pnpm exec next start -p ${PORT} -H 127.0.0.1`
          : `pnpm exec next dev -p ${PORT} -H 127.0.0.1`,
        url: `${BASE_URL}/login`,
        reuseExistingServer: false,
        timeout: 120_000,
        env: {
          ...process.env,
          // Chạy ở chế độ demo auth (chỉ tắt Supabase Auth để kiểm tra toàn bộ màn hình ở chế độ read-only;
          // dùng " " thay vì "" vì Windows xoá env rỗng khiến Next nạp lại .env.local).
          NEXT_PUBLIC_SUPABASE_URL: " ",
          NEXT_PUBLIC_SUPABASE_ANON_KEY: " ",
          NEXT_PUBLIC_SB_SUPABASE_URL: " ",
          NEXT_PUBLIC_SB_SUPABASE_ANON_KEY: " ",
          SB_SUPABASE_URL: " ",
          SB_SUPABASE_ANON_KEY: " ",
        },
      },
});
