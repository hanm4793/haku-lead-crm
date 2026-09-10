import {
  ALL_CAR_MODELS,
  ASSIGNEES,
  BRAND_OPTIONS,
  SALES_ROOMS,
  SHOWROOMS,
  SOURCE_OPTIONS,
} from "@/lib/constants";

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

function matchByName<T extends string>(haystack: string, candidates: readonly T[]) {
  return candidates.filter((value) => haystack.includes(normalize(value)));
}

/**
 * Dọn lại spec do LLM sinh ra bằng một lớp xác định.
 *
 * Model rất tốt ở phần hiểu ý định (khoảng thời gian, phân loại, tách sheet)
 * nhưng hay bỏ sót các thực thể phải khớp chính xác từng ký tự — đặc biệt là
 * tên dòng xe. Việc dò tên thì regex làm chuẩn hơn và không tốn token, nên ở
 * đây ta chỉ bổ sung khi model để trống chứ không ghi đè lựa chọn của model.
 */
export function refineSpec(spec: ExportSpec, userText: string): ExportSpec {
  const q = normalize(userText);
  const filters: ExportFilters = { ...spec.filters };

  filters.sources = dropIfExhaustive(
    filters.sources,
    SOURCE_OPTIONS.map((o) => o.value),
  );
  filters.brands = dropIfExhaustive(
    filters.brands,
    BRAND_OPTIONS.map((o) => o.value),
  );
  filters.carModels = dropIfExhaustive(filters.carModels, ALL_CAR_MODELS);
  filters.showrooms = dropIfExhaustive(filters.showrooms, SHOWROOMS);
  filters.salesRooms = dropIfExhaustive(filters.salesRooms, SALES_ROOMS);
  filters.assignees = dropIfExhaustive(filters.assignees, ASSIGNEES);

  if (!filters.search?.trim()) delete filters.search;

  if (!filters.carModels?.length) {
    const models = matchByName(q, ALL_CAR_MODELS);
    if (models.length) filters.carModels = models;
  }

  if (!filters.showrooms?.length) {
    const showrooms = matchByName(q, SHOWROOMS);
    if (showrooms.length) filters.showrooms = showrooms;
  }

  if (!filters.assignees?.length) {
    const assignees = matchByName(q, ASSIGNEES);
    if (assignees.length) filters.assignees = assignees;
  }

  if (!filters.brands?.length) {
    const brands = matchByName(
      q,
      BRAND_OPTIONS.map((o) => o.value),
    );
    // Nếu đã khóa theo dòng xe cụ thể thì thêm hãng chỉ làm hẹp thừa.
    if (brands.length && !filters.carModels?.length) filters.brands = brands;
  }

  if (!filters.sources?.length) {
    const sources = SOURCE_OPTIONS.filter(
      (o) => q.includes(normalize(o.label)) || q.includes(normalize(o.value)),
    ).map((o) => o.value);
    if (sources.length) filters.sources = sources;
  }

  if (!filters.b10 || filters.b10 === "ALL") {
    if (/chua (len |day |dua )?b10|chua doi soat/.test(q)) filters.b10 = "NOT_PUSHED";
    else if (/da (len |day |dua )?b10|da doi soat/.test(q)) filters.b10 = "PUSHED";
  }

  if (!filters.overdueOnly && /qua han/.test(q)) filters.overdueOnly = true;

  return { ...spec, filters };
}
