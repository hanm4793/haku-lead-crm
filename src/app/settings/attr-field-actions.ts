"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageAttrFields, canManageAttrFieldsInProject } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import {
  createAttrField,
  deleteAttrField,
  getAttrField,
  updateAttrField,
  type AttrFieldType,
} from "@/lib/db/attr-fields-repo";
import { assertCanAccessProject, resolveActiveProject, toProjectViewer } from "@/lib/db/project-repo";

export type AttrFieldActionResult = { ok: true } | { ok: false; error: string };

const fieldTypeSchema = z.enum(["text", "number", "select", "date"]);

async function requireAttrFieldAdmin(explicitProjectId?: string): Promise<{ projectId: string } | { error: string }> {
  const viewer = await getScopedViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };

  if (explicitProjectId) {
    if (!canManageAttrFieldsInProject(viewer, explicitProjectId)) {
      return { error: "Bạn không có quyền quản lý field phụ project này." };
    }
    try {
      await assertCanAccessProject(toProjectViewer(viewer), explicitProjectId);
      return { projectId: explicitProjectId };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Không truy cập được project." };
    }
  }

  if (!canManageAttrFields(viewer.role)) {
    return { error: "Chỉ super admin mới quản lý field phụ tại Cài đặt." };
  }
  try {
    const project = await resolveActiveProject(toProjectViewer(viewer));
    return { projectId: project.id };
  } catch {
    return { error: "Chưa có project — chạy pnpm db:migrate và pnpm db:seed." };
  }
}

function revalidateAttrFieldPages(projectId?: string) {
  revalidatePath("/settings");
  revalidatePath("/leads");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function run(
  action: (projectId: string) => Promise<unknown>,
  fallback: string,
  explicitProjectId?: string,
): Promise<AttrFieldActionResult> {
  const gate = await requireAttrFieldAdmin(explicitProjectId);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await action(gate.projectId);
    revalidateAttrFieldPages(gate.projectId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : fallback };
  }
}

const scopedSchema = z.object({ projectId: z.string().uuid().optional() });

const idSchema = z.string().uuid();
const toggleSchema = z.object({ id: idSchema, active: z.boolean() });

const createSchema = scopedSchema.extend({
  label: z.string().min(1).max(120),
  key: z.string().max(64).optional(),
  fieldType: fieldTypeSchema.default("text"),
  optionsCsv: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

function parseOptionsCsv(csv: string | undefined, fieldType: AttrFieldType): string[] {
  if (fieldType !== "select") return [];
  if (!csv?.trim()) return [];
  return csv
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createAttrFieldAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu field không hợp lệ." };
  const { projectId, label, key, fieldType, optionsCsv, required } = parsed.data;
  const options = parseOptionsCsv(optionsCsv, fieldType);
  if (fieldType === "select" && options.length === 0) {
    return { ok: false, error: "Field select cần ít nhất một lựa chọn." };
  }
  return run(
    (pid) =>
      createAttrField({
        projectId: pid,
        label,
        key,
        fieldType,
        options,
        required,
      }),
    "Thêm field thất bại.",
    projectId,
  );
}

const updateSchema = scopedSchema.extend({
  id: idSchema,
  label: z.string().min(1).max(120).optional(),
  fieldType: fieldTypeSchema.optional(),
  optionsCsv: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

export async function updateAttrFieldAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu field không hợp lệ." };
  const { id, projectId, label, fieldType, optionsCsv, required } = parsed.data;
  return run(async (pid) => {
    const existing = await getAttrField(id);
    if (!existing || existing.projectId !== pid) throw new Error("Không tìm thấy field.");
    const nextType = fieldType ?? existing.fieldType;
    const patch: Parameters<typeof updateAttrField>[1] = {};
    if (label !== undefined) patch.label = label;
    if (fieldType !== undefined) patch.fieldType = fieldType;
    if (required !== undefined) patch.required = required;
    if (optionsCsv !== undefined || fieldType !== undefined) {
      patch.options = parseOptionsCsv(optionsCsv ?? existing.options.join(", "), nextType);
    }
    if (nextType === "select" && (patch.options?.length ?? existing.options.length) === 0) {
      throw new Error("Field select cần ít nhất một lựa chọn.");
    }
    await updateAttrField(id, patch);
  }, "Cập nhật field thất bại.", projectId);
}

const toggleScopedSchema = toggleSchema.extend({ projectId: z.string().uuid().optional() });

export async function setAttrFieldActiveAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = toggleScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run(async (pid) => {
    const existing = await getAttrField(parsed.data.id);
    if (!existing || existing.projectId !== pid) throw new Error("Không tìm thấy field.");
    await updateAttrField(parsed.data.id, { active: parsed.data.active });
  }, "Cập nhật field thất bại.", parsed.data.projectId);
}

const deleteScopedSchema = z.object({ id: idSchema, projectId: z.string().uuid().optional() });

export async function deleteAttrFieldAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = deleteScopedSchema.safeParse(typeof input === "string" ? { id: input } : input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run(async (pid) => {
    const existing = await getAttrField(parsed.data.id);
    if (!existing || existing.projectId !== pid) throw new Error("Không tìm thấy field.");
    await deleteAttrField(parsed.data.id);
  }, "Xóa field thất bại.", parsed.data.projectId);
}
