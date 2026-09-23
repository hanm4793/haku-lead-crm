"use server";

import { revalidatePath } from "next/cache";

import { getViewer } from "@/lib/auth/viewer";
import { purgeSampleLeads } from "@/lib/facebook/purge-sample-leads";
import { syncFacebookLeads, type SyncLeadsResult } from "@/lib/facebook/sync-leads";

export type SyncFacebookLeadsActionResult =
  | { ok: true; result: SyncLeadsResult }
  | { ok: false; error: string };

export type PurgeSampleLeadsActionResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

async function requireAdmin(): Promise<string | null> {
  const viewer = await getViewer();
  if (!viewer) return "Phiên đăng nhập đã hết hạn.";
  if (viewer.role !== "ADMIN") return "Chỉ ADMIN mới đồng bộ dữ liệu Facebook.";
  return null;
}

function revalidateFacebookPages() {
  revalidatePath("/leads");
  revalidatePath("/settings");
}

export async function syncFacebookLeadsAction(): Promise<SyncFacebookLeadsActionResult> {
  const gateError = await requireAdmin();
  if (gateError) return { ok: false, error: gateError };

  try {
    const result = await syncFacebookLeads();
    revalidateFacebookPages();
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Đồng bộ Facebook thất bại.",
    };
  }
}

export async function purgeSampleLeadsAction(): Promise<PurgeSampleLeadsActionResult> {
  const gateError = await requireAdmin();
  if (gateError) return { ok: false, error: gateError };

  try {
    const { deleted } = await purgeSampleLeads();
    revalidateFacebookPages();
    return { ok: true, deleted };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Xóa lead mẫu thất bại.",
    };
  }
}
