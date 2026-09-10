"use client";

import { create } from "zustand";

import { EMPTY_FILTERS } from "@/lib/filters";
import type { LeadFilters } from "@/lib/types";

/**
 * Store chỉ còn giữ bộ lọc.
 *
 * Dữ liệu lead đã chuyển sang server: trang danh sách và trang báo cáo tự truy
 * vấn theo bộ lọc này. Bộ lọc vẫn cần nằm ở store toàn cục vì khung chat AI ở
 * sidebar phải áp được bộ lọc rồi điều hướng sang trang danh sách.
 */
interface LeadStore {
  filters: LeadFilters;
  setFilters: (patch: Partial<LeadFilters>) => void;
  replaceFilters: (filters: LeadFilters) => void;
  resetFilters: () => void;
}

export const useLeadStore = create<LeadStore>((set) => ({
  filters: EMPTY_FILTERS,
  setFilters: (patch) => set((s) => ({ filters: { ...s.filters, ...patch } })),
  replaceFilters: (filters) => set({ filters }),
  resetFilters: () => set({ filters: EMPTY_FILTERS }),
}));
