import type { Lead, LeadFilters } from "./types";
import { endOfDay, startOfDay } from "./utils";

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  tab: "ALL",
  dateFrom: null,
  dateTo: null,
  sources: [],
  brands: [],
  locations: [],
  assignees: [],
  products: [],
  categories: [],
  failReasons: [],
  facebookPageIds: [],
};

/**
 * Lead quá hạn = có hẹn gọi lại, thời điểm hẹn đã trôi qua, và khách vẫn còn
 * trong phễu (chưa ký hợp đồng, chưa bị loại).
 */
export function isOverdue(lead: Lead, now: Date = new Date()) {
  if (!lead.callbackAt) return false;
  if (lead.category === "FAIL" || lead.category === "KHD") return false;
  return new Date(lead.callbackAt).getTime() < now.getTime();
}

/** Số lead cần gọi trong hôm nay (widget nhắc việc). */
export function isDueToday(lead: Lead, now: Date = new Date()) {
  if (!lead.callbackAt) return false;
  if (lead.category === "FAIL" || lead.category === "KHD") return false;
  const t = new Date(lead.callbackAt).getTime();
  return t >= startOfDay(now).getTime() && t <= endOfDay(now).getTime();
}

function normalize(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLowerCase();
}

export function applyLeadFilters(leads: Lead[], filters: LeadFilters, now: Date = new Date()): Lead[] {
  const search = normalize(filters.search.trim());
  const from = filters.dateFrom ? startOfDay(new Date(filters.dateFrom)).getTime() : null;
  const to = filters.dateTo ? endOfDay(new Date(filters.dateTo)).getTime() : null;

  return leads.filter((lead) => {
    if (search) {
      const haystack = normalize(`${lead.name ?? ""} ${lead.phone}`);
      if (!haystack.includes(search)) return false;
    }

    const created = new Date(lead.createdAt).getTime();
    if (from !== null && created < from) return false;
    if (to !== null && created > to) return false;

    switch (filters.tab) {
      case "CHUA_LIEN_HE":
        if (lead.contactStatus !== "CHUA_LIEN_HE") return false;
        break;
      case "DA_LIEN_HE":
        if (lead.contactStatus !== "DA_LIEN_HE") return false;
        break;
      case "QUA_HAN":
        if (!isOverdue(lead, now)) return false;
        break;
    }

    if (filters.sources.length && !filters.sources.includes(lead.source)) return false;
    if (filters.brands.length && (!lead.brand || !filters.brands.includes(lead.brand))) return false;
    if (filters.locations.length && !filters.locations.includes(lead.location)) return false;
    if (filters.assignees.length && !filters.assignees.includes(lead.assignee ?? "")) return false;
    if (filters.products.length && !filters.products.includes(lead.product ?? "")) return false;
    if (filters.categories.length && !filters.categories.includes(lead.category)) return false;
    if (filters.failReasons.length && !filters.failReasons.includes(lead.failReason!)) return false;
    if (
      filters.facebookPageIds.length &&
      (!lead.facebookPageId || !filters.facebookPageIds.includes(lead.facebookPageId))
    ) {
      return false;
    }

    return true;
  });
}

/** Đếm điều kiện trong popover Bộ lọc. Khoảng ngày nằm ở nút chọn thời gian riêng, không tính vào badge. */
export function countActiveFilters(filters: LeadFilters) {
  let n = 0;
  n += filters.sources.length ? 1 : 0;
  n += filters.brands.length ? 1 : 0;
  n += filters.locations.length ? 1 : 0;
  n += filters.assignees.length ? 1 : 0;
  n += filters.products.length ? 1 : 0;
  n += filters.categories.length ? 1 : 0;
  n += filters.failReasons.length ? 1 : 0;
  n += filters.facebookPageIds.length ? 1 : 0;
  return n;
}
