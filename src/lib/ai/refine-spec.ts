import { SOURCE_OPTIONS } from "@/lib/constants";
import { PIVOT_DIMENSIONS, type PivotDimension } from "@/lib/metrics";

import { DEFAULT_AI_CATALOG, type AiCatalog } from "./catalog-context";
import type { ExportFilters, ExportSpec } from "./export-spec";
import {
  parseTimeRange,
  stripMentionLabels,
  wantsResetScope,
  type ChatMention,
  type StatsQuery,
} from "./stats-query";

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
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

export interface RefineSpecContext {
  mentions?: ChatMention[];
  lastStats?: StatsQuery | null;
  lastSpec?: ExportSpec | null;
  now?: Date;
}

/**
 * Dọn lại spec do LLM sinh ra bằng một lớp xác định, đồng thời kế thừa
 * ngữ cảnh từ @mentions, `lastStats` hoặc `lastSpec` khi người dùng yêu cầu
 * "xuất danh sách này ra excel" / "xuất file csv".
 */
export function refineSpec(
  spec: ExportSpec,
  userText: string,
  catalog: AiCatalog = DEFAULT_AI_CATALOG,
  context?: RefineSpecContext,
): ExportSpec {
  const mentions = context?.mentions ?? [];
  const lastStats = context?.lastStats ?? null;
  const lastSpec = context?.lastSpec ?? null;
  const cleanText = mentions.length ? stripMentionLabels(userText, mentions) : userText;
  const q = normalize(cleanText);
  const resetScope = wantsResetScope(cleanText);

  const inheritedFilters: ExportFilters = resetScope
    ? {}
    : {
        ...(lastSpec?.filters ?? {}),
        ...(lastStats?.filters ?? {}),
      };

  const filters: ExportFilters = {
    ...inheritedFilters,
    ...spec.filters,
  };

  // Thời gian: ưu tiên mốc thời gian tường minh trong câu hiện tại; nếu không có thì kế thừa từ lastStats/lastSpec
  const time = parseTimeRange(cleanText, context?.now ?? new Date());
  if (time.clearsDate) {
    delete filters.dateFrom;
    delete filters.dateTo;
  } else if (time.hasExplicitTime) {
    filters.dateFrom = time.dateFrom;
    filters.dateTo = time.dateTo;
  } else if (!filters.dateFrom && !filters.dateTo) {
    if (lastStats?.dateFrom || lastStats?.dateTo) {
      filters.dateFrom = lastStats.dateFrom;
      filters.dateTo = lastStats.dateTo;
    } else if (lastSpec?.filters?.dateFrom || lastSpec?.filters?.dateTo) {
      filters.dateFrom = lastSpec.filters.dateFrom;
      filters.dateTo = lastSpec.filters.dateTo;
    }
  }

  filters.sources = dropIfExhaustive(
    filters.sources,
    SOURCE_OPTIONS.map((o) => o.value),
  );
  filters.brands = dropIfExhaustive(keepKnown(filters.brands, catalog.brands), catalog.brands);
  filters.products = dropIfExhaustive(keepKnown(filters.products, catalog.products), catalog.products);
  filters.locations = dropIfExhaustive(keepKnown(filters.locations, catalog.locations), catalog.locations);
  filters.assignees = dropIfExhaustive(keepKnown(filters.assignees, catalog.assignees), catalog.assignees);

  if (!filters.search?.trim()) delete filters.search;

  // Áp dụng @mentions trực tiếp vào bộ lọc Export
  if (!resetScope && mentions.length > 0) {
    const pageIds = mentions.filter((m) => m.type === "fanpage").map((m) => m.id);
    const brandIds = mentions.filter((m) => m.type === "brand").map((m) => m.id);
    const productNames = mentions.filter((m) => m.type === "product").map((m) => m.label);
    const locationNames = mentions.filter((m) => m.type === "location").map((m) => m.label);
    const assigneeNames = mentions.filter((m) => m.type === "assignee").map((m) => m.label);

    if (pageIds.length) filters.facebookPageIds = pageIds;
    if (brandIds.length) filters.brands = brandIds;
    if (productNames.length) filters.products = productNames;
    if (locationNames.length) filters.locations = locationNames;
    if (assigneeNames.length) filters.assignees = assigneeNames;
  }

  // Kế thừa facebookPageIds từ lastStats nếu chưa có
  if (!resetScope && !filters.facebookPageIds?.length) {
    if (lastStats?.pageIds?.length) {
      filters.facebookPageIds = lastStats.pageIds;
    } else if (lastSpec?.filters?.facebookPageIds?.length) {
      filters.facebookPageIds = lastSpec.filters.facebookPageIds;
    }
  }

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
    else if (!resetScope && lastStats?.assigneeQuery) {
      const matchedFromStats = keepKnown([lastStats.assigneeQuery], catalog.assignees);
      if (matchedFromStats?.length) filters.assignees = matchedFromStats;
    }
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

  const columns = [...(spec.columns?.length ? spec.columns : (lastSpec?.columns ?? []))];
  if (catalog.attrFields?.length) {
    for (const attr of catalog.attrFields) {
      const attrKeyCol = `attr:${attr.key}`;
      if (!columns.includes(attrKeyCol) && (q.includes(normalize(attr.label)) || q.includes(normalize(attr.key)))) {
        columns.push(attrKeyCol);
      }
    }
  }

  let splitSheetsBy = spec.splitSheetsBy ?? lastSpec?.splitSheetsBy ?? null;
  if (!splitSheetsBy && lastStats?.groupBy && lastStats.groupBy in PIVOT_DIMENSIONS) {
    splitSheetsBy = lastStats.groupBy as PivotDimension;
  }

  const format = /csv/.test(q) ? "csv" : /excel|xlsx/.test(q) ? "xlsx" : (spec.format ?? "xlsx");

  return {
    ...spec,
    filters,
    columns,
    splitSheetsBy,
    format,
  };
}

