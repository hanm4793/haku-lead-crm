import { and, asc, eq, sql } from "drizzle-orm";

import { getDb } from "@/lib/db/client";
import { brands, leads, locations, products } from "@/lib/db/schema";

/**
 * CRUD danh mục brands / products / locations cho super admin (trang Cài đặt).
 * Mọi hàm nhận `projectId` — Phase B luôn là project mặc định.
 *
 * Xóa chỉ cho phép khi chưa có lead trỏ tới; còn lại dùng `active` để ẩn khỏi
 * dropdown mà không mất lịch sử.
 */

export type BrandRow = typeof brands.$inferSelect;
export type ProductRow = typeof products.$inferSelect;
export type LocationRow = typeof locations.$inferSelect;

export interface ProductWithBrand extends ProductRow {
  brandCode: string;
  brandName: string;
}

export interface CatalogSnapshot {
  brands: BrandRow[];
  products: ProductWithBrand[];
  locations: LocationRow[];
}

function cleanName(value: string, label: string, max = 120): string {
  const trimmed = value.trim().replace(/\s+/g, " ");
  if (!trimmed) throw new Error(`${label} không được để trống.`);
  if (trimmed.length > max) throw new Error(`${label} tối đa ${max} ký tự.`);
  return trimmed;
}

/** Mã brand: chữ in, số, gạch dưới / gạch ngang. */
export function normalizeBrandCode(value: string): string {
  const code = value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/gi, "d")
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "");
  if (!code) throw new Error("Mã thương hiệu không hợp lệ.");
  if (code.length > 40) throw new Error("Mã thương hiệu tối đa 40 ký tự.");
  return code;
}

export async function listCatalog(projectId: string): Promise<CatalogSnapshot> {
  const db = getDb();
  const [brandRows, productRows, locationRows] = await Promise.all([
    db
      .select()
      .from(brands)
      .where(eq(brands.projectId, projectId))
      .orderBy(asc(brands.sortOrder), asc(brands.name)),
    db
      .select({
        id: products.id,
        projectId: products.projectId,
        brandId: products.brandId,
        name: products.name,
        active: products.active,
        brandCode: brands.code,
        brandName: brands.name,
      })
      .from(products)
      .innerJoin(brands, eq(products.brandId, brands.id))
      .where(eq(products.projectId, projectId))
      .orderBy(asc(brands.sortOrder), asc(brands.name), asc(products.name)),
    db
      .select()
      .from(locations)
      .where(eq(locations.projectId, projectId))
      .orderBy(asc(locations.sortOrder), asc(locations.name)),
  ]);
  return { brands: brandRows, products: productRows, locations: locationRows };
}

// ---------------------------------------------------------------- brands

export async function createBrand(
  projectId: string,
  input: { code: string; name: string },
): Promise<BrandRow> {
  const code = normalizeBrandCode(input.code || input.name);
  const name = cleanName(input.name, "Tên thương hiệu");
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${brands.sortOrder}), -1) + 1` })
    .from(brands)
    .where(eq(brands.projectId, projectId));

  const [row] = await db
    .insert(brands)
    .values({ projectId, code, name, sortOrder: next })
    .onConflictDoNothing({ target: [brands.projectId, brands.code] })
    .returning();
  if (!row) throw new Error(`Mã thương hiệu ${code} đã tồn tại.`);
  return row;
}

export async function updateBrand(
  projectId: string,
  id: string,
  patch: { name?: string; code?: string; active?: boolean; sortOrder?: number },
): Promise<BrandRow> {
  const values: Partial<typeof brands.$inferInsert> = {};
  if (patch.name !== undefined) values.name = cleanName(patch.name, "Tên thương hiệu");
  if (patch.code !== undefined) values.code = normalizeBrandCode(patch.code);
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (!Object.keys(values).length) throw new Error("Không có gì để cập nhật.");

  const [row] = await getDb()
    .update(brands)
    .set(values)
    .where(and(eq(brands.id, id), eq(brands.projectId, projectId)))
    .returning();
  if (!row) throw new Error("Không tìm thấy thương hiệu.");
  return row;
}

export async function deleteBrand(projectId: string, id: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.brandId, id));
  if (n > 0) throw new Error(`Còn ${n} lead gắn thương hiệu này — hãy tắt thay vì xóa.`);

  // Sản phẩm cascade theo brand; chặn nếu có lead trỏ tới sản phẩm của brand.
  const [{ p }] = await db
    .select({ p: sql<number>`count(*)::int` })
    .from(leads)
    .innerJoin(products, eq(leads.productId, products.id))
    .where(eq(products.brandId, id));
  if (p > 0) throw new Error(`Còn ${p} lead gắn sản phẩm của thương hiệu này — hãy tắt thay vì xóa.`);

  await db.delete(brands).where(and(eq(brands.id, id), eq(brands.projectId, projectId)));
}

// -------------------------------------------------------------- products

export async function createProduct(
  projectId: string,
  input: { brandId: string; name: string },
): Promise<ProductRow> {
  const name = cleanName(input.name, "Tên sản phẩm", 80);
  const db = getDb();

  const [brand] = await db
    .select({ id: brands.id })
    .from(brands)
    .where(and(eq(brands.id, input.brandId), eq(brands.projectId, projectId)))
    .limit(1);
  if (!brand) throw new Error("Thương hiệu không thuộc project này.");

  const [row] = await db
    .insert(products)
    .values({ projectId, brandId: brand.id, name })
    .onConflictDoNothing({ target: [products.brandId, products.name] })
    .returning();
  if (!row) throw new Error(`Sản phẩm ${name} đã có trong thương hiệu này.`);
  return row;
}

export async function updateProduct(
  projectId: string,
  id: string,
  patch: { name?: string; brandId?: string; active?: boolean },
): Promise<ProductRow> {
  const values: Partial<typeof products.$inferInsert> = {};
  if (patch.name !== undefined) values.name = cleanName(patch.name, "Tên sản phẩm", 80);
  if (patch.brandId !== undefined) {
    const [brand] = await getDb()
      .select({ id: brands.id })
      .from(brands)
      .where(and(eq(brands.id, patch.brandId), eq(brands.projectId, projectId)))
      .limit(1);
    if (!brand) throw new Error("Thương hiệu không thuộc project này.");
    values.brandId = brand.id;
  }
  if (patch.active !== undefined) values.active = patch.active;
  if (!Object.keys(values).length) throw new Error("Không có gì để cập nhật.");

  const [row] = await getDb()
    .update(products)
    .set(values)
    .where(and(eq(products.id, id), eq(products.projectId, projectId)))
    .returning();
  if (!row) throw new Error("Không tìm thấy sản phẩm.");
  return row;
}

export async function deleteProduct(projectId: string, id: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.productId, id));
  if (n > 0) throw new Error(`Còn ${n} lead gắn sản phẩm này — hãy tắt thay vì xóa.`);
  await db.delete(products).where(and(eq(products.id, id), eq(products.projectId, projectId)));
}

// ------------------------------------------------------------- locations

export async function createLocation(projectId: string, input: { name: string }): Promise<LocationRow> {
  const name = cleanName(input.name, "Tên địa điểm");
  const db = getDb();

  const [{ next }] = await db
    .select({ next: sql<number>`coalesce(max(${locations.sortOrder}), -1) + 1` })
    .from(locations)
    .where(eq(locations.projectId, projectId));

  const [row] = await db
    .insert(locations)
    .values({ projectId, name, sortOrder: next })
    .onConflictDoNothing({ target: [locations.projectId, locations.name] })
    .returning();
  if (!row) throw new Error(`Địa điểm ${name} đã tồn tại.`);
  return row;
}

export async function updateLocation(
  projectId: string,
  id: string,
  patch: { name?: string; active?: boolean; sortOrder?: number },
): Promise<LocationRow> {
  const values: Partial<typeof locations.$inferInsert> = {};
  if (patch.name !== undefined) values.name = cleanName(patch.name, "Tên địa điểm");
  if (patch.active !== undefined) values.active = patch.active;
  if (patch.sortOrder !== undefined) values.sortOrder = patch.sortOrder;
  if (!Object.keys(values).length) throw new Error("Không có gì để cập nhật.");

  const [row] = await getDb()
    .update(locations)
    .set(values)
    .where(and(eq(locations.id, id), eq(locations.projectId, projectId)))
    .returning();
  if (!row) throw new Error("Không tìm thấy địa điểm.");
  return row;
}

export async function deleteLocation(projectId: string, id: string): Promise<void> {
  const db = getDb();
  const [{ n }] = await db
    .select({ n: sql<number>`count(*)::int` })
    .from(leads)
    .where(eq(leads.locationId, id));
  if (n > 0) throw new Error(`Còn ${n} lead gắn địa điểm này — hãy tắt thay vì xóa.`);
  await db.delete(locations).where(and(eq(locations.id, id), eq(locations.projectId, projectId)));
}
