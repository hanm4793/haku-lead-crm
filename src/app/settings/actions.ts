"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageCatalogs, canManageCatalogsInProject } from "@/lib/auth/roles";
import { getViewer } from "@/lib/auth/viewer";
import {
  createBrand,
  createLocation,
  createProduct,
  deleteBrand,
  deleteLocation,
  deleteProduct,
  updateBrand,
  updateLocation,
  updateProduct,
} from "@/lib/db/catalog-repo";
import { assertCanAccessProject, resolveActiveProject, toProjectViewer } from "@/lib/db/project-repo";

export type CatalogActionResult = { ok: true } | { ok: false; error: string };

/**
 * Server action quản lý danh mục brand / sản phẩm / địa điểm.
 * Chặn quyền ở đây (`canManageCatalogs`), không dựa vào việc UI có ẩn form.
 */
async function requireCatalogAdmin(explicitProjectId?: string): Promise<{ projectId: string } | { error: string }> {
  const viewer = await getViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };

  if (explicitProjectId) {
    if (!canManageCatalogsInProject(viewer, explicitProjectId)) {
      return { error: "Bạn không có quyền quản lý danh mục project này." };
    }
    try {
      await assertCanAccessProject(toProjectViewer(viewer), explicitProjectId);
      return { projectId: explicitProjectId };
    } catch (error) {
      return { error: error instanceof Error ? error.message : "Không truy cập được project." };
    }
  }

  if (!canManageCatalogs(viewer.role)) return { error: "Chỉ super admin mới quản lý danh mục tại Cài đặt." };
  try {
    const project = await resolveActiveProject(toProjectViewer(viewer));
    return { projectId: project.id };
  } catch {
    return { error: "Chưa có project — chạy pnpm db:migrate và pnpm db:seed." };
  }
}

function revalidateCatalogPages(projectId?: string) {
  revalidatePath("/settings");
  revalidatePath("/leads");
  revalidatePath("/reports");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

async function run(
  action: (projectId: string) => Promise<unknown>,
  fallback: string,
  explicitProjectId?: string,
): Promise<CatalogActionResult> {
  const gate = await requireCatalogAdmin(explicitProjectId);
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await action(gate.projectId);
    revalidateCatalogPages(gate.projectId);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : fallback };
  }
}

const scopedSchema = z.object({ projectId: z.string().uuid().optional() });

const idSchema = z.string().uuid();
const toggleSchema = z.object({ id: idSchema, active: z.boolean() });

// ---------------------------------------------------------------- brands

const createBrandSchema = scopedSchema.extend({
  code: z.string().max(40).default(""),
  name: z.string().min(1).max(120),
});

export async function createBrandAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = createBrandSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu thương hiệu không hợp lệ." };
  const { projectId, ...data } = parsed.data;
  return run((pid) => createBrand(pid, data), "Thêm thương hiệu thất bại.", projectId);
}

const toggleScopedSchema = toggleSchema.extend({ projectId: z.string().uuid().optional() });

export async function setBrandActiveAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = toggleScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run(
    (projectId) => updateBrand(projectId, parsed.data.id, { active: parsed.data.active }),
    "Cập nhật thương hiệu thất bại.",
    parsed.data.projectId,
  );
}

const idScopedSchema = z.object({ id: idSchema, projectId: z.string().uuid().optional() });

export async function deleteBrandAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = idScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run((projectId) => deleteBrand(projectId, parsed.data.id), "Xóa thương hiệu thất bại.", parsed.data.projectId);
}

// -------------------------------------------------------------- products

const createProductSchema = scopedSchema.extend({
  brandId: idSchema,
  name: z.string().min(1).max(80),
});

export async function createProductAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = createProductSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu sản phẩm không hợp lệ." };
  const { projectId, ...data } = parsed.data;
  return run((pid) => createProduct(pid, data), "Thêm sản phẩm thất bại.", projectId);
}

export async function setProductActiveAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = toggleScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run(
    (projectId) => updateProduct(projectId, parsed.data.id, { active: parsed.data.active }),
    "Cập nhật sản phẩm thất bại.",
    parsed.data.projectId,
  );
}

export async function deleteProductAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = idScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run((projectId) => deleteProduct(projectId, parsed.data.id), "Xóa sản phẩm thất bại.", parsed.data.projectId);
}

// ------------------------------------------------------------- locations

const createLocationSchema = scopedSchema.extend({ name: z.string().min(1).max(120) });

export async function createLocationAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = createLocationSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu địa điểm không hợp lệ." };
  const { projectId, ...data } = parsed.data;
  return run((pid) => createLocation(pid, data), "Thêm địa điểm thất bại.", projectId);
}

export async function setLocationActiveAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = toggleScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run(
    (projectId) => updateLocation(projectId, parsed.data.id, { active: parsed.data.active }),
    "Cập nhật địa điểm thất bại.",
    parsed.data.projectId,
  );
}

export async function deleteLocationAction(input: unknown): Promise<CatalogActionResult> {
  const parsed = idScopedSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Dữ liệu không hợp lệ." };
  return run((projectId) => deleteLocation(projectId, parsed.data.id), "Xóa địa điểm thất bại.", parsed.data.projectId);
}
