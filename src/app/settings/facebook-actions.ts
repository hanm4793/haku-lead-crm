"use server";

import { revalidatePath } from "next/cache";

import { canManageSettings } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import { resolveActiveProject, toProjectViewer } from "@/lib/db/project-repo";
import {
  addFacebookPage,
  removeFacebookPage,
  setFacebookPageActive,
  type FacebookPageRow,
} from "@/lib/db/facebook-pages-repo";
import { purgeSampleLeads } from "@/lib/facebook/purge-sample-leads";
import {
  syncFacebookInsights,
  type SyncInsightsResult,
} from "@/lib/facebook/sync-insights";
import { syncFacebookLeads, type SyncLeadsResult } from "@/lib/facebook/sync-leads";

export type SyncFacebookLeadsActionResult =
  | { ok: true; result: SyncLeadsResult }
  | { ok: false; error: string };

export type SyncFacebookInsightsActionResult =
  | { ok: true; result: SyncInsightsResult }
  | { ok: false; error: string };

export type PurgeSampleLeadsActionResult =
  | { ok: true; deleted: number }
  | { ok: false; error: string };

export type FacebookPageActionResult =
  | { ok: true; page?: FacebookPageRow }
  | { ok: false; error: string };

async function requireAdmin(): Promise<{ error: string } | { viewer: NonNullable<Awaited<ReturnType<typeof getScopedViewer>>> }> {
  const viewer = await getScopedViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageSettings(viewer.role)) return { error: "Chỉ super admin mới đồng bộ dữ liệu Facebook." };
  return { viewer };
}

function revalidateFacebookPages() {
  revalidatePath("/leads");
  revalidatePath("/settings");
}

export async function syncFacebookLeadsAction(): Promise<SyncFacebookLeadsActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

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

export async function syncFacebookInsightsAction(): Promise<SyncFacebookInsightsActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  try {
    const result = await syncFacebookInsights();
    revalidatePath("/marketing");
    revalidatePath("/settings");
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Đồng bộ Insights thất bại.",
    };
  }
}

export async function purgeSampleLeadsAction(): Promise<PurgeSampleLeadsActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

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

export async function addFacebookPageAction(input: {
  facebookPageId: string;
  name?: string;
}): Promise<FacebookPageActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const active = await resolveActiveProject(toProjectViewer(gate.viewer));
    const page = await addFacebookPage(input.facebookPageId, input.name ?? null, active.id);
    revalidatePath("/settings");
    return { ok: true, page };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Thêm Fanpage thất bại.",
    };
  }
}

export async function setFacebookPageActiveAction(input: {
  id: string;
  active: boolean;
}): Promise<FacebookPageActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    const page = await setFacebookPageActive(input.id, input.active);
    revalidatePath("/settings");
    return { ok: true, page };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cập nhật Fanpage thất bại.",
    };
  }
}

export async function removeFacebookPageAction(id: string): Promise<FacebookPageActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  try {
    await removeFacebookPage(id);
    revalidatePath("/settings");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Xóa Fanpage thất bại.",
    };
  }
}
