import {
  ALL_PRODUCTS,
  ASSIGNEES,
  DEFAULT_BRAND_SEED,
  DEFAULT_CATALOG_LABELS,
  LOCATIONS,
} from "@/lib/constants";
import type { ReferenceData } from "@/lib/db/leads-repo";
import type { CatalogLabels } from "@/lib/types";

/**
 * Danh mục giá trị hợp lệ mà prompt / bộ dò từ khóa của AI dùng. Runtime lấy
 * từ DB qua `catalogFromReference`; bản mặc định từ constants là fallback khi
 * chưa có DB (test, demo).
 */
export interface AiCatalog {
  labels: CatalogLabels;
  /** Mã brand (brands.code). */
  brands: string[];
  products: string[];
  locations: string[];
  assignees: string[];
}

export const DEFAULT_AI_CATALOG: AiCatalog = {
  labels: DEFAULT_CATALOG_LABELS,
  brands: DEFAULT_BRAND_SEED.map((b) => b.code),
  products: ALL_PRODUCTS,
  locations: [...LOCATIONS],
  assignees: [...ASSIGNEES],
};

export function catalogFromReference(reference: ReferenceData): AiCatalog {
  return {
    labels: reference.labels,
    brands: reference.brands.map((b) => b.code),
    products: [...new Set(Object.values(reference.productsByBrand).flat())],
    locations: reference.locations,
    assignees: reference.assignees,
  };
}
