"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import {
  canManageAttrFields,
  canManageAttrFieldsInProject,
  canSuggestAttrFieldsFromSample,
} from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import {
  createAttrField,
  deleteAttrField,
  getAttrField,
  isListAttrFieldType,
  listAttrFields,
  updateAttrField,
  type AttrFieldType,
} from "@/lib/db/attr-fields-repo";
import { getReferenceData } from "@/lib/db/leads-repo";
import { assertCanAccessProject, resolveActiveProject, toProjectViewer } from "@/lib/db/project-repo";
import {
  analyzeExcelForAttrFields,
  slugifyAttrKey,
  type AnalyzeAttrFieldsReport,
} from "@/lib/leads/analyze-attr-fields";

export type AttrFieldActionResult = { ok: true } | { ok: false; error: string };

const fieldTypeSchema = z.enum(["text", "number", "select", "multiselect", "boolean", "date"]);

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
  options: z.array(z.string().max(200)).optional(),
  optionsCsv: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

function resolveOptions(
  options: string[] | undefined,
  csv: string | undefined,
  fieldType: AttrFieldType,
): string[] {
  if (!isListAttrFieldType(fieldType)) return [];
  if (options) {
    return options.map((s) => s.trim()).filter(Boolean);
  }
  if (!csv?.trim()) return [];
  return csv
    .split(/[,;\n]/)
    .map((s) => s.trim())
    .filter(Boolean);
}

export async function createAttrFieldAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = createSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu field không hợp lệ." };
  const { projectId, label, key, fieldType, options: rawOptions, optionsCsv, required } = parsed.data;
  const options = resolveOptions(rawOptions, optionsCsv, fieldType);
  if (isListAttrFieldType(fieldType) && options.length === 0) {
    return { ok: false, error: "Field danh sách cần ít nhất một lựa chọn." };
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
  options: z.array(z.string().max(200)).optional(),
  optionsCsv: z.string().max(2000).optional(),
  required: z.boolean().optional(),
});

export async function updateAttrFieldAction(input: unknown): Promise<AttrFieldActionResult> {
  const parsed = updateSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu field không hợp lệ." };
  const { id, projectId, label, fieldType, options: rawOptions, optionsCsv, required } = parsed.data;
  return run(async (pid) => {
    const existing = await getAttrField(id);
    if (!existing || existing.projectId !== pid) throw new Error("Không tìm thấy field.");
    const nextType = fieldType ?? existing.fieldType;
    const patch: Parameters<typeof updateAttrField>[1] = {};
    if (label !== undefined) patch.label = label;
    if (fieldType !== undefined) patch.fieldType = fieldType;
    if (required !== undefined) patch.required = required;
    if (rawOptions !== undefined || optionsCsv !== undefined || fieldType !== undefined) {
      patch.options = resolveOptions(rawOptions, optionsCsv ?? existing.options.join(", "), nextType);
    }
    if (isListAttrFieldType(nextType) && (patch.options?.length ?? existing.options.length) === 0) {
      throw new Error("Field danh sách cần ít nhất một lựa chọn.");
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

export type AnalyzeAttrFieldsResult =
  | { ok: true; report: AnalyzeAttrFieldsReport }
  | { ok: false; error: string };

export async function analyzeAttrFieldsFromExcelAction(
  formData: FormData,
): Promise<AnalyzeAttrFieldsResult> {
  const rawProjectId = formData.get("projectId");
  const explicitProjectId =
    typeof rawProjectId === "string" && rawProjectId.trim() ? rawProjectId.trim() : undefined;

  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canSuggestAttrFieldsFromSample(viewer, explicitProjectId)) {
    return { ok: false, error: "Bạn không có quyền thiết lập field phụ từ file mẫu." };
  }

  const gate = await requireAttrFieldAdmin(explicitProjectId);
  if ("error" in gate) return { ok: false, error: gate.error };

  const file = formData.get("file");
  if (!(file instanceof File)) {
    return { ok: false, error: "Vui lòng chọn file Excel (.xlsx)." };
  }
  if (!file.name.toLowerCase().endsWith(".xlsx")) {
    return { ok: false, error: "Chỉ hỗ trợ định dạng file Excel (.xlsx)." };
  }

  try {
    const [arrayBuffer, existingFields, reference] = await Promise.all([
      file.arrayBuffer(),
      listAttrFields(gate.projectId),
      getReferenceData(gate.projectId, viewer).catch(() => null),
    ]);

    const report = await analyzeExcelForAttrFields(arrayBuffer, {
      existingFields,
      labels: reference?.labels,
      enableAi: true,
    });

    return { ok: true, report };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không phân tích được file Excel.",
    };
  }
}

const bulkCreateFieldsSchema = scopedSchema.extend({
  fields: z
    .array(
      z.object({
        label: z.string().trim().min(1).max(120),
        key: z.string().trim().max(64).optional(),
        fieldType: fieldTypeSchema.default("text"),
        options: z.array(z.string().max(200)).optional(),
        required: z.boolean().optional(),
      }),
    )
    .min(1)
    .max(100),
});

export type BulkCreateAttrFieldsResult =
  | { ok: true; createdCount: number; skippedCount: number }
  | { ok: false; error: string };

export async function bulkCreateAttrFieldsAction(
  input: unknown,
): Promise<BulkCreateAttrFieldsResult> {
  const parsed = bulkCreateFieldsSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Danh sách field cần tạo không hợp lệ." };
  }

  const { projectId: explicitProjectId, fields } = parsed.data;
  const viewer = await getScopedViewer();
  if (!viewer) return { ok: false, error: "Phiên đăng nhập đã hết hạn." };
  if (!canSuggestAttrFieldsFromSample(viewer, explicitProjectId)) {
    return { ok: false, error: "Bạn không có quyền tạo nhanh field phụ." };
  }

  const gate = await requireAttrFieldAdmin(explicitProjectId);
  if ("error" in gate) return { ok: false, error: gate.error };

  try {
    const existing = await listAttrFields(gate.projectId);
    const existingKeys = new Set(existing.map((f) => f.key.toLowerCase()));
    let nextSortOrder =
      existing.reduce((max, f) => Math.max(max, f.sortOrder), 0) + 1;

    let createdCount = 0;
    let skippedCount = 0;

    for (const item of fields) {
      const key = slugifyAttrKey(item.key?.trim() || item.label);
      if (!key || existingKeys.has(key)) {
        skippedCount++;
        continue;
      }
      const options = isListAttrFieldType(item.fieldType)
        ? (item.options ?? []).map((o) => o.trim()).filter(Boolean)
        : [];
      if (isListAttrFieldType(item.fieldType) && options.length === 0) {
        skippedCount++;
        continue;
      }
      await createAttrField({
        projectId: gate.projectId,
        label: item.label,
        key,
        fieldType: item.fieldType,
        options,
        required: Boolean(item.required),
        sortOrder: nextSortOrder++,
      });
      existingKeys.add(key);
      createdCount++;
    }

    revalidateAttrFieldPages(gate.projectId);
    return { ok: true, createdCount, skippedCount };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Tạo hàng loạt field phụ thất bại.",
    };
  }
}

