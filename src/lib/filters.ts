import type { Lead, LeadFilters } from "./types";
import { endOfDay, startOfDay } from "./utils";

export const EMPTY_FILTERS: LeadFilters = {
  search: "",
  tab: "ALL",
  dateFrom: null,
  dateTo: null,
  sources: [],
  brands: [],
  showrooms: [],
  salesRooms: [],
  assignees: [],
  carModels: [],
  categories: [],
  failReasons: [],
  b10: "ALL",
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
    if (filters.brands.length && !filters.brands.includes(lead.brand)) return false;
    if (filters.showrooms.length && !filters.showrooms.includes(lead.showroom)) return false;
    if (filters.salesRooms.length && !filters.salesRooms.includes(lead.salesRoom)) return false;
    if (filters.assignees.length && !filters.assignees.includes(lead.assignee ?? "")) return false;
    if (filters.carModels.length && !filters.carModels.includes(lead.carModel ?? "")) return false;
    if (filters.categories.length && !filters.categories.includes(lead.category)) return false;
    if (filters.failReasons.length && !filters.failReasons.includes(lead.failReason!)) return false;
    if (filters.b10 === "PUSHED" && !lead.pushedToB10) return false;
    if (filters.b10 === "NOT_PUSHED" && lead.pushedToB10) return false;

    return true;
  });
}

export function countActiveFilters(filters: LeadFilters) {
  let n = 0;
  if (filters.dateFrom || filters.dateTo) n += 1;
  n += filters.sources.length ? 1 : 0;
  n += filters.brands.length ? 1 : 0;
  n += filters.showrooms.length ? 1 : 0;
  n += filters.salesRooms.length ? 1 : 0;
  n += filters.assignees.length ? 1 : 0;
  n += filters.carModels.length ? 1 : 0;
  n += filters.categories.length ? 1 : 0;
  n += filters.failReasons.length ? 1 : 0;
  n += filters.b10 !== "ALL" ? 1 : 0;
  return n;
}
