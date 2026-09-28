import { and, asc, eq } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { projectAttrFields } from "@/lib/db/schema";

export type AttrFieldType = "text" | "number" | "select" | "date";

export type AttrFieldRow = {
  id: string;
  projectId: string;
  key: string;
  label: string;
  fieldType: AttrFieldType;
  options: string[];
  required: boolean;
  sortOrder: number;
  active: boolean;
};

function slugKey(raw: string) {
  return raw
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 64);
}

function toRow(row: typeof projectAttrFields.$inferSelect): AttrFieldRow {
  return {
    id: row.id,
    projectId: row.projectId,
    key: row.key,
    label: row.label,
    fieldType: row.fieldType,
    options: Array.isArray(row.options) ? row.options : [],
    required: row.required,
    sortOrder: row.sortOrder,
    active: row.active,
  };
}

export async function getAttrField(id: string): Promise<AttrFieldRow | null> {
  const [row] = await getDb().select().from(projectAttrFields).where(eq(projectAttrFields.id, id)).limit(1);
  return row ? toRow(row) : null;
}

export async function listAttrFields(
  projectId: string,
  options: { activeOnly?: boolean } = {},
): Promise<AttrFieldRow[]> {
  const conditions = [eq(projectAttrFields.projectId, projectId)];
  if (options.activeOnly) conditions.push(eq(projectAttrFields.active, true));
  const rows = await getDb()
    .select()
    .from(projectAttrFields)
    .where(and(...conditions))
    .orderBy(asc(projectAttrFields.sortOrder), asc(projectAttrFields.label));
  return rows.map(toRow);
}

export async function createAttrField(input: {
  projectId: string;
  key?: string;
  label: string;
  fieldType?: AttrFieldType;
  options?: string[];
  required?: boolean;
  sortOrder?: number;
}): Promise<AttrFieldRow> {
  const label = input.label.trim();
  if (!label) throw new Error("Nhãn field bắt buộc.");
  const key = slugKey(input.key?.trim() || label);
  if (!key) throw new Error("Key field không hợp lệ.");

  const [row] = await getDb()
    .insert(projectAttrFields)
    .values({
      projectId: input.projectId,
      key,
      label,
      fieldType: input.fieldType ?? "text",
      options: input.fieldType === "select" ? (input.options ?? []).map((o) => o.trim()).filter(Boolean) : [],
      required: Boolean(input.required),
      sortOrder: input.sortOrder ?? 0,
    })
    .returning();
  if (!row) throw new Error("Không tạo được field.");
  return toRow(row);
}

export async function updateAttrField(
  id: string,
  patch: Partial<{
    label: string;
    fieldType: AttrFieldType;
    options: string[];
    required: boolean;
    sortOrder: number;
    active: boolean;
  }>,
): Promise<AttrFieldRow> {
  const values: Record<string, unknown> = { updatedAt: new Date() };
  if (patch.label !== undefined) {
    const label = patch.label.trim();
    if (!label) throw new Error("Nhãn field bắt buộc.");
    values.label = label;
  }
  if (patch.fieldType !== undefined) values.fieldType = patch.fieldType;
  if (patch.options !== undefined) {
    values.options = patch.options.map((o) => o.trim()).filter(Boolean);
  }
  if (patch.required !== undefined) values.required = patch.required;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (patch.active !== undefined) values.active = patch.active;

  const [row] = await getDb()
    .update(projectAttrFields)
    .set(values)
    .where(eq(projectAttrFields.id, id))
    .returning();
  if (!row) throw new Error("Không tìm thấy field.");
  return toRow(row);
}

export async function deleteAttrField(id: string) {
  const deleted = await getDb()
    .delete(projectAttrFields)
    .where(eq(projectAttrFields.id, id))
    .returning({ id: projectAttrFields.id });
  if (!deleted.length) throw new Error("Không tìm thấy field.");
}
