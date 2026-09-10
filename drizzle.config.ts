import { existsSync } from "node:fs";

import { defineConfig } from "drizzle-kit";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

/**
 * DDL đi qua kết nối trực tiếp (cổng 5432) chứ không qua pooler: pooler chạy
 * transaction mode nên một số câu lệnh migration sẽ thất bại ở đó.
 */
const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;

// `generate` chỉ so sánh schema với snapshot trên đĩa, không cần kết nối.
if (!url && !process.argv.includes("generate")) {
  throw new Error("Thiếu DIRECT_URL (hoặc DATABASE_URL) trong .env.local để chạy migration.");
}

export default defineConfig({
  schema: "./src/lib/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  dbCredentials: { url: url ?? "" },
  casing: "snake_case",
  verbose: true,
  strict: true,
});
