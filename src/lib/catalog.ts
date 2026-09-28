import {
  DEFAULT_BRAND_SEED,
  DEFAULT_CATALOG_LABELS,
  LOCATIONS,
  PRODUCTS_BY_BRAND,
} from "./constants";
import type { ReferenceData } from "./db/leads-repo";
import type { BrandCode, CatalogLabels } from "./types";

/**
 * Danh mục 3 dimension + nhãn, ở dạng client component dùng được (plain JSON).
 * Server đọc `getReferenceData()` rồi đổi qua `catalogOptionsFromReference`;
 * khi chưa có DB thì dùng bản mặc định từ constants.
 */
export interface LeadCatalogOptions {
  labels: CatalogLabels;
  brands: { code: BrandCode; name: string }[];
  locations: string[];
  /** brand code → tên sản phẩm đang bật. */
  productsByBrand: Record<string, string[]>;
}

export const DEFAULT_LEAD_CATALOG: LeadCatalogOptions = {
  labels: DEFAULT_CATALOG_LABELS,
  brands: DEFAULT_BRAND_SEED,
  locations: [...LOCATIONS],
  productsByBrand: PRODUCTS_BY_BRAND,
};

export function catalogOptionsFromReference(reference: ReferenceData): LeadCatalogOptions {
  return {
    labels: reference.labels,
    brands: reference.brands,
    locations: reference.locations,
    productsByBrand: reference.productsByBrand,
  };
}

export function allProducts(catalog: LeadCatalogOptions): string[] {
  return [...new Set(Object.values(catalog.productsByBrand).flat())];
}

export function brandLabel(catalog: LeadCatalogOptions, code: BrandCode | null | undefined): string | null {
  if (!code) return null;
  return catalog.brands.find((b) => b.code === code)?.name ?? code;
}
