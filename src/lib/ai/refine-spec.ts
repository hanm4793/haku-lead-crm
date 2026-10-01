import { SOURCE_OPTIONS } from "@/lib/constants";

import { DEFAULT_AI_CATALOG, type AiCatalog } from "./catalog-context";
import type { ExportFilters, ExportSpec } from "./export-spec";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .toLowerCase();
}

/**
 * Mảng chứa trọn vẹn danh sách hợp lệ nghĩa là "không lọc gì cả". LLM hay điền
 * kiểu này để tỏ ra đầy đủ, giữ lại chỉ khiến chip bộ lọc trên UI rối mắt.
 */
function dropIfExhaustive<T extends string>(selected: T[] | undefined, all: readonly T[]) {
  if (!selected?.length) return undefined;
  return selected.length >= all.length ? undefined : selected;
}

/** Chỉ giữ giá trị có trong danh mục — model hay bịa tên gần đúng. */
function keepKnown(selected: string[] | undefined, all: readonly string[]) {
  if (!selected?.length) return undefined;
  const byNormalized = new Map(all.map((value) => [normalize(value), value]));
  const kept = [
    ...new Set(
      selected
        .map((value) => byNormalized.get(normalize(value)))
        .filter((value): value is string => value !== undefined),
    ),
  ];
  return kept.length ? kept : undefined;
}

function matchByName<T extends string>(haystack: string, candidates: readonly T[]) {
  return candidates.filter((value) => haystack.includes(normalize(value)));
}

/**
 * Dọn lại spec do LLM sinh ra bằng một lớp xác định.
 *
 * Model rất tốt ở phần hiểu ý định (khoảng thời gian, phân loại, tách sheet)
 * nhưng hay bỏ sót các thực thể phải khớp chính xác từng ký tự — đặc biệt là
 * tên sản phẩm. Việc dò tên thì regex làm chuẩn hơn và không tốn token, nên ở
 * đây ta chỉ bổ sung khi model để trống chứ không ghi đè lựa chọn của model.
 */
export function refineSpec(spec: ExportSpec, userText: string, catalog: AiCatalog = DEFAULT_AI_CATALOG): ExportSpec {
  const q = normalize(userText);
  const filters: ExportFilters = { ...spec.filters };

  filters.sources = dropIfExhaustive(
    filters.sources,
    SOURCE_OPTIONS.map((o) => o.value),
  );
  filters.brands = dropIfExhaustive(keepKnown(filters.brands, catalog.brands), catalog.brands);
  filters.products = dropIfExhaustive(keepKnown(filters.products, catalog.products), catalog.products);
  filters.locations = dropIfExhaustive(keepKnown(filters.locations, catalog.locations), catalog.locations);
  filters.assignees = dropIfExhaustive(keepKnown(filters.assignees, catalog.assignees), catalog.assignees);

  if (!filters.search?.trim()) delete filters.search;

  if (!filters.products?.length) {
    const products = matchByName(q, catalog.products);
    if (products.length) filters.products = products;
  }

  if (!filters.locations?.length) {
    const locations = matchByName(q, catalog.locations);
    if (locations.length) filters.locations = locations;
  }

  if (!filters.assignees?.length) {
    const assignees = matchByName(q, catalog.assignees);
    if (assignees.length) filters.assignees = assignees;
  }

  if (!filters.brands?.length) {
    const brands = matchByName(q, catalog.brands);
    // Nếu đã khóa theo sản phẩm cụ thể thì thêm brand chỉ làm hẹp thừa.
    if (brands.length && !filters.products?.length) filters.brands = brands;
  }

  if (!filters.sources?.length) {
    const sources = SOURCE_OPTIONS.filter(
      (o) => q.includes(normalize(o.label)) || q.includes(normalize(o.value)),
    ).map((o) => o.value);
    if (sources.length) filters.sources = sources;
  }

  if (!filters.overdueOnly && /qua han/.test(q)) filters.overdueOnly = true;

  const columns = [...spec.columns];
  if (catalog.attrFields?.length) {
    for (const attr of catalog.attrFields) {
      const attrKeyCol = `attr:${attr.key}`;
      if (!columns.includes(attrKeyCol) && (q.includes(normalize(attr.label)) || q.includes(normalize(attr.key)))) {
        columns.push(attrKeyCol);
      }
    }
  }

  return { ...spec, filters, columns };
}
