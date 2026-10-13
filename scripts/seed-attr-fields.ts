import { existsSync } from "node:fs";

if (existsSync(".env.local")) process.loadEnvFile(".env.local");

import { and, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";

import { DEFAULT_PROJECT_SLUG } from "../src/lib/constants";
import { DEMO_ATTR_FIELDS } from "../src/lib/demo-attr-fields";
import * as schema from "../src/lib/db/schema";

/**
 * Nạp cấu hình field phụ mẫu (đủ text / number / select / date) vào một project có sẵn.
 * Chỉ thêm field chưa có theo key, không sửa field cũ và không đụng tới lead.
 *   pnpm db:seed:attrs [slug-project]   (mặc định: semtop-auto)
 */
async function main() {
  const url = process.env.DIRECT_URL ?? process.env.DATABASE_URL;
  if (!url) throw new Error("Thiếu DIRECT_URL (hoặc DATABASE_URL) trong .env.local.");

  const slug = process.argv[2] ?? DEFAULT_PROJECT_SLUG;
  const sql = postgres(url, { prepare: false, max: 1 });
  const db = drizzle(sql, { schema });

  try {
    const [project] = await db
      .select({ id: schema.projects.id, name: schema.projects.name })
      .from(schema.projects)
      .where(eq(schema.projects.slug, slug));
    if (!project) throw new Error(`Không tìm thấy project "${slug}".`);

    const existing = await db
      .select({ key: schema.projectAttrFields.key })
      .from(schema.projectAttrFields)
      .where(eq(schema.projectAttrFields.projectId, project.id));
    const existingKeys = new Set(existing.map((r) => r.key));
    const sortBase = existing.length;

    const toInsert = DEMO_ATTR_FIELDS.filter((f) => !existingKeys.has(f.key));
    if (toInsert.length) {
      await db.insert(schema.projectAttrFields).values(
        toInsert.map((f, i) => ({
          projectId: project.id,
          key: f.key,
          label: f.label,
          fieldType: f.fieldType,
          options: f.options ?? [],
          active: f.active ?? true,
          sortOrder: sortBase + i,
        })),
      );
    }

    const total = await db
      .select({ key: schema.projectAttrFields.key })
      .from(schema.projectAttrFields)
      .where(and(eq(schema.projectAttrFields.projectId, project.id)));
    console.log(`Project «${project.name}»: thêm ${toInsert.length} field, bỏ qua ${DEMO_ATTR_FIELDS.length - toInsert.length} field đã có. Tổng ${total.length} field.`);
  } finally {
    await sql.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
