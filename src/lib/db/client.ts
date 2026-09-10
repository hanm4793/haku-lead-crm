import { drizzle, type PostgresJsDatabase } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import * as schema from "./schema";

export type Db = PostgresJsDatabase<typeof schema>;

export function isDatabaseConfigured() {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * Dev server của Next hot-reload liên tục, mỗi lần reload mà mở pool mới thì
 * Supabase sẽ hết slot kết nối rất nhanh. Giữ pool trên globalThis để sống sót
 * qua các lần reload.
 */
const globalForDb = globalThis as unknown as {
  __crmSql?: ReturnType<typeof postgres>;
  __crmDb?: Db;
};

function connectionUrl() {
  // `vercel env pull` đôi khi bọc giá trị trong dấu ngoặc kép.
  const raw = process.env.DATABASE_URL?.trim();
  if (!raw) {
    throw new Error(
      "Thiếu DATABASE_URL. Lấy connection string ở Neon/Supabase rồi đặt vào .env.local.",
    );
  }
  return raw.replace(/^"(.*)"$/, "$1").replace(/^'(.*)'$/, "$1");
}

function createClient() {
  const url = connectionUrl();

  return postgres(url, {
    // Supabase pooler chạy ở transaction mode nên không dùng được prepared
    // statement — bật prepare sẽ lỗi ngay từ truy vấn thứ hai.
    prepare: false,
    max: 10,
    idle_timeout: 20,
    connect_timeout: 15,
  });
}

export function getDb(): Db {
  if (!globalForDb.__crmDb) {
    globalForDb.__crmSql = globalForDb.__crmSql ?? createClient();
    globalForDb.__crmDb = drizzle(globalForDb.__crmSql, { schema });
  }
  return globalForDb.__crmDb;
}

export { schema };
