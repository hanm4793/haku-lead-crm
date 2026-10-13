"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageSettings } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
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

async function requireAdmin(): Promise<{ error: string } | { viewer: NonNullable<Awaited<ReturnType<typeof getScopedViewer>>> }> {
  const viewer = await getScopedViewer();
  if (!viewer) return { error: "Phiên đăng nhập đã hết hạn." };
  if (!canManageSettings(viewer.role)) return { error: "Chỉ super admin mới đồng bộ dữ liệu Facebook." };
  return { viewer };
}

const scopeSchema = z.object({ projectId: z.string().uuid().optional() }).optional();

function parseScope(input: unknown): string | undefined | null {
  const parsed = scopeSchema.safeParse(input);
  return parsed.success ? parsed.data?.projectId : null;
}

function revalidateFacebookPages(projectId?: string) {
  revalidatePath("/leads");
  revalidatePath("/settings");
  revalidatePath("/projects");
  if (projectId) revalidatePath(`/projects/${projectId}`);
}

/** Truyền `projectId` để chỉ đồng bộ các fanpage đang bật của dự án đó. */
export async function syncFacebookLeadsAction(input?: {
  projectId?: string;
}): Promise<SyncFacebookLeadsActionResult> {
  const gate = await requireAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };
  const projectId = parseScope(input);
  if (projectId === null) return { ok: false, error: "Project không hợp lệ." };

  try {
    const result = await syncFacebookLeads({ projectId });
    revalidateFacebookPages(projectId);
    return { ok: true, result };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Đồng bộ Facebook thất bại.",
    };
  }
}

/** Đồng bộ cả ad account (Meta không cho lọc insights theo fanpage). */
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

  return {
    ok: false,
    error: "Tính năng xóa lead mẫu đã bị vô hiệu hóa để bảo vệ dữ liệu.",
  };
}

