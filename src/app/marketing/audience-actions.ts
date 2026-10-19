"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";

import { canManageAudiences } from "@/lib/auth/roles";
import { getScopedViewer } from "@/lib/auth/viewer";
import {
  analyzeFanpagePersona,
  createAudienceSegments,
  deleteAudienceSegment,
  listAudienceSegments,
  previewAudienceSegment,
  syncAudienceSegmentToMeta,
  updateAudienceSegment,
  type AudiencePreviewResult,
  type AudienceSegmentView,
} from "@/lib/db/audiences-repo";
import type { AudienceFilterConfig } from "@/lib/db/schema";
import {
  listAccessibleAdAccounts,
  type AccessibleAdAccount,
  type FanpagePersonaAnalysis,
  type SyncMetaAudienceResult,
} from "@/lib/facebook/custom-audiences";

const LEAD_CATEGORIES = [
  "CHUA_PHAN_LOAI",
  "KHQT",
  "GDTD",
  "KHD",
  "CHUA_LH_DUOC",
  "FAIL",
] as const;

const CONTACT_STATUSES = ["CHUA_LIEN_HE", "DA_LIEN_HE"] as const;

const FAIL_REASONS = [
  "SAI_SO",
  "KHONG_CO_NHU_CAU",
  "DA_MUA_NOI_KHAC",
  "CHI_KHAO_GIA",
  "NGOAI_KHA_NANG_TAI_CHINH",
  "KH_TINH_KHAC",
  "TRUNG_SPAM",
  "KHAC",
] as const;

const LEAD_SOURCES = [
  "FACEBOOK",
  "GOOGLE",
  "TIKTOK",
  "ZALO",
  "WEBSITE",
  "HOTLINE",
  "MANUAL",
] as const;

const CHANNEL_DETAILS = [
  "TIN_NHAN",
  "FORM",
  "COMMENT",
  "CUOC_GOI",
  "CHAT_WEB",
] as const;

const SEED_SOURCES = [
  "auto_crm_or_page",
  "crm_contacts",
  "page_engagement",
  "page_messaged",
] as const;

const LOOKALIKE_TIERS = [
  "0_1",
  "0_2",
  "0_3",
  "1_3",
  "3_5",
  "5_7",
  "7_10",
] as const;

const personaConfigSchema = z.object({
  enableLookalike: z.boolean().optional(),
  seedSource: z.enum(SEED_SOURCES).optional(),
  pageRetentionDays: z.number().int().min(30).max(365).optional(),
  lookalikeTiers: z.array(z.enum(LOOKALIKE_TIERS)).max(7).optional(),
  enableSavedAudience: z.boolean().optional(),
  ageMin: z.number().int().min(18).max(65).optional(),
  ageMax: z.number().int().min(18).max(65).optional(),
  gender: z.union([z.literal(0), z.literal(1), z.literal(2)]).optional(),
  regionKeys: z.array(z.string().trim().min(1).max(20)).max(63).optional(),
});

const audienceFilterSchema = z.object({
  projectIds: z.array(z.string().uuid()).max(100).optional(),
  facebookPageIds: z.array(z.string().trim().min(1)).max(200).optional(),
  campaigns: z.array(z.string().trim().min(1).max(300)).max(200).optional(),
  channelDetails: z.array(z.enum(CHANNEL_DETAILS)).optional(),
  categories: z.array(z.enum(LEAD_CATEGORIES)).optional(),
  contactStatuses: z.array(z.enum(CONTACT_STATUSES)).optional(),
  failReasons: z.array(z.enum(FAIL_REASONS)).optional(),
  sources: z.array(z.enum(LEAD_SOURCES)).optional(),
  brandIds: z.array(z.string().uuid()).max(100).optional(),
  productIds: z.array(z.string().uuid()).max(200).optional(),
  locationIds: z.array(z.string().uuid()).max(100).optional(),
  dateFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  dateTo: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  personaConfig: personaConfigSchema.optional(),
});

const previewSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  filters: audienceFilterSchema,
});

const createSegmentSchema = z.object({
  name: z.string().trim().min(1, "Vui lòng nhập tên tệp khách hàng.").max(200),
  description: z.string().trim().max(500).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  filters: audienceFilterSchema,
  facebookAdAccountId: z.string().trim().max(100).nullable().optional(),
  mode: z.enum(["merge", "split_by_page"]).optional(),
  syncImmediately: z.boolean().optional(),
});

const updateSegmentSchema = z.object({
  id: z.string().uuid(),
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().max(500).nullable().optional(),
  projectId: z.string().uuid().nullable().optional(),
  filters: audienceFilterSchema.optional(),
  facebookAdAccountId: z.string().trim().max(100).nullable().optional(),
});

const syncSegmentSchema = z.object({
  segmentId: z.string().uuid(),
  adAccountId: z.string().trim().max(100).nullable().optional(),
});

async function requireAudienceAdmin(): Promise<
  | { error: string }
  | { viewer: NonNullable<Awaited<ReturnType<typeof getScopedViewer>>> }
> {
  const viewer = await getScopedViewer();
  if (!viewer || !canManageAudiences(viewer.role)) {
    return { error: "Chỉ Super Admin mới có quyền quản lý và đẩy tệp khách hàng." };
  }
  return { viewer };
}

export async function listAdAccountsForAudienceAction(): Promise<
  { ok: true; accounts: AccessibleAdAccount[] } | { ok: false; error: string }
> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  try {
    const accounts = await listAccessibleAdAccounts();
    return { ok: true, accounts };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không lấy được danh sách Tài khoản Quảng cáo từ Facebook.",
    };
  }
}

export async function listSavedAudiencesAction(
  projectId?: string | null,
): Promise<{ ok: true; segments: AudienceSegmentView[] } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  if (projectId && !z.string().uuid().safeParse(projectId).success) {
    return { ok: false, error: "Dự án không hợp lệ." };
  }

  try {
    const segments = await listAudienceSegments(projectId);
    return { ok: true, segments };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không tải được danh sách tệp khách hàng.",
    };
  }
}

export async function previewAudienceAction(input: {
  projectId?: string | null;
  filters: AudienceFilterConfig;
}): Promise<{ ok: true; preview: AudiencePreviewResult } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = previewSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Bộ lọc tệp khách hàng không hợp lệ." };
  }

  try {
    const preview = await previewAudienceSegment({
      projectId: parsed.data.projectId ?? null,
      filters: parsed.data.filters,
    });
    return { ok: true, preview };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể tính toán xem trước tệp khách hàng.",
    };
  }
}

export async function createAudienceSegmentAction(input: {
  name: string;
  description?: string | null;
  projectId?: string | null;
  filters: AudienceFilterConfig;
  facebookAdAccountId?: string | null;
  mode?: "merge" | "split_by_page";
  syncImmediately?: boolean;
}): Promise<
  | {
      ok: true;
      createdIds: string[];
      count: number;
      syncedCount: number;
      syncError?: string;
    }
  | { ok: false; error: string }
> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = createSegmentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Dữ liệu tạo tệp khách hàng không hợp lệ.",
    };
  }

  try {
    const { createdIds, count } = await createAudienceSegments({
      name: parsed.data.name,
      description: parsed.data.description,
      projectId: parsed.data.projectId ?? null,
      filters: parsed.data.filters,
      facebookAdAccountId: parsed.data.facebookAdAccountId,
      mode: parsed.data.mode,
    });

    let syncedCount = 0;
    let syncError: string | undefined;

    if (parsed.data.syncImmediately && parsed.data.facebookAdAccountId) {
      for (const segmentId of createdIds) {
        try {
          await syncAudienceSegmentToMeta({
            segmentId,
            adAccountId: parsed.data.facebookAdAccountId,
          });
          syncedCount += 1;
        } catch (err) {
          syncError = err instanceof Error ? err.message : "Đồng bộ lên Facebook thất bại.";
        }
      }
    }

    revalidatePath("/marketing");
    return { ok: true, createdIds, count, syncedCount, syncError };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Không thể tạo tệp khách hàng.",
    };
  }
}

export async function updateAudienceSegmentAction(input: {
  id: string;
  name?: string;
  description?: string | null;
  projectId?: string | null;
  filters?: AudienceFilterConfig;
  facebookAdAccountId?: string | null;
}): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = updateSegmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Dữ liệu cập nhật tệp không hợp lệ." };
  }

  try {
    await updateAudienceSegment(parsed.data.id, parsed.data);
    revalidatePath("/marketing");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Cập nhật tệp khách hàng thất bại.",
    };
  }
}

export async function deleteAudienceSegmentAction(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  if (!z.string().uuid().safeParse(id).success) {
    return { ok: false, error: "Mã tệp khách hàng không hợp lệ." };
  }

  try {
    await deleteAudienceSegment(id);
    revalidatePath("/marketing");
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Xóa tệp khách hàng thất bại.",
    };
  }
}

export async function syncAudienceToFacebookAction(input: {
  segmentId: string;
  adAccountId?: string | null;
}): Promise<{ ok: true; result: SyncMetaAudienceResult } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = syncSegmentSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Thông tin đồng bộ không hợp lệ." };
  }

  try {
    const result = await syncAudienceSegmentToMeta({
      segmentId: parsed.data.segmentId,
      adAccountId: parsed.data.adAccountId,
    });
    revalidatePath("/marketing");
    return { ok: true, result };
  } catch (error) {
    revalidatePath("/marketing");
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Đồng bộ lên Facebook Custom Audience thất bại.",
    };
  }
}

const analyzePersonaSchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
  pageIds: z.array(z.string().trim().min(1)).max(200).optional(),
});

export async function analyzeFanpagePersonaAction(input: {
  projectId?: string | null;
  pageIds?: string[];
}): Promise<{ ok: true; analysis: FanpagePersonaAnalysis } | { ok: false; error: string }> {
  const gate = await requireAudienceAdmin();
  if ("error" in gate) return { ok: false, error: gate.error };

  const parsed = analyzePersonaSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Tham số phân tích chân dung không hợp lệ." };
  }

  try {
    const analysis = await analyzeFanpagePersona({
      projectId: parsed.data.projectId ?? null,
      pageIds: parsed.data.pageIds ?? [],
    });
    return { ok: true, analysis };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Không thể phân tích chân dung khách hàng từ Meta Graph API.",
    };
  }
}

