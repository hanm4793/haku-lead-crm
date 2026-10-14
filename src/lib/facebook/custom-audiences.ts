import {
  chunkMetaAudiencePayload,
  type AudienceContact,
} from "@/lib/audiences/customer-audience";

import { getFacebookConfig, normalizeAdAccountId } from "./env";
import { FacebookGraphError, graphGetAllData, graphPost } from "./graph-client";

export interface AccessibleAdAccount {
  /** Luôn có tiền tố `act_...` */
  id: string;
  /** Mã số không có `act_` */
  accountId: string;
  name: string;
  accountStatus: number | null;
  currency: string | null;
  isDefault: boolean;
}

type MeAdAccount = {
  id: string;
  account_id?: string;
  name?: string;
  account_status?: number;
  currency?: string;
};

type CreateCustomAudienceResponse = {
  id?: string;
};

type PushAudienceUsersResponse = {
  audience_id?: string;
  session_id?: string;
  num_received?: number;
  num_invalid_entries?: number;
};

/**
 * Lấy danh sách tất cả Tài khoản Quảng cáo (`act_...`) mà tài khoản Facebook tổng
 * (`FACEBOOK_ACCESS_TOKEN`) của Super Admin đang có quyền truy cập.
 */
export async function listAccessibleAdAccounts(): Promise<AccessibleAdAccount[]> {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Chưa cấu hình FACEBOOK_ACCESS_TOKEN.");
  }

  const defaultAdAccountId = config.adAccountId;
  const byId = new Map<string, AccessibleAdAccount>();

  try {
    const rawAccounts = await graphGetAllData<MeAdAccount>("/me/adaccounts", {
      fields: "id,account_id,name,account_status,currency",
      limit: "100",
    });

    for (const item of rawAccounts) {
      const id = normalizeAdAccountId(item.id || item.account_id);
      if (!id) continue;
      const accountId = item.account_id?.trim() || id.replace(/^act_/, "");
      byId.set(id, {
        id,
        accountId,
        name: item.name?.trim() || `Tài khoản ${accountId}`,
        accountStatus: typeof item.account_status === "number" ? item.account_status : null,
        currency: item.currency?.trim() || null,
        isDefault: id === defaultAdAccountId,
      });
    }
  } catch (error) {
    // Nếu token chưa cấp quyền đọc /me/adaccounts nhưng có FACEBOOK_AD_ACCOUNT_ID trong env thì vẫn fallback được
    if (!defaultAdAccountId) {
      throw error;
    }
  }

  if (defaultAdAccountId && !byId.has(defaultAdAccountId)) {
    const accountId = defaultAdAccountId.replace(/^act_/, "");
    byId.set(defaultAdAccountId, {
      id: defaultAdAccountId,
      accountId,
      name: `TKQC Mặc định (${accountId})`,
      accountStatus: 1,
      currency: "VND",
      isDefault: true,
    });
  }

  return [...byId.values()].sort((a, b) => {
    if (a.isDefault !== b.isDefault) return a.isDefault ? -1 : 1;
    return a.name.localeCompare(b.name, "vi");
  });
}

/** Dịch lỗi từ Facebook Graph API sang hướng dẫn tiếng Việt rõ ràng. */
function formatMetaAudienceError(error: unknown, adAccountId: string): Error {
  if (!(error instanceof FacebookGraphError)) {
    return error instanceof Error ? error : new Error("Lỗi kết nối Facebook Graph API.");
  }
  const cleanAct = adAccountId.replace(/^act_/, "");
  const msg = error.message || "";

  if (
    /terms of service|custom audience terms|tos/i.test(msg) ||
    error.code === 2654 ||
    error.code === 2655
  ) {
    return new Error(
      `Tài khoản quảng cáo (${adAccountId}) chưa chấp nhận Điều khoản Custom Audience của Meta. Vui lòng mở link: https://business.facebook.com/ads/manage/customaudiences/tos/?act=${cleanAct} bấm Chấp nhận (Accept) rồi thử lại. (${msg})`,
    );
  }

  if (error.code === 200 || error.code === 10 || /ads_management|permission/i.test(msg)) {
    return new Error(
      `Tài khoản Facebook hoặc Token thiếu quyền quản trị quảng cáo (ads_management) trên TKQC ${adAccountId}: ${msg}`,
    );
  }

  return new Error(`Facebook Graph API (${adAccountId}): ${msg}`);
}

/** Tạo mới một Custom Audience (Customer List) trên Tài khoản Quảng cáo Meta. */
export async function createMetaCustomAudience(input: {
  adAccountId: string;
  name: string;
  description?: string | null;
}): Promise<string> {
  const normalizedAccount = normalizeAdAccountId(input.adAccountId);
  if (!normalizedAccount) {
    throw new Error("Mã Tài khoản Quảng cáo (Ad Account ID) không hợp lệ.");
  }

  let res: CreateCustomAudienceResponse;
  try {
    res = await graphPost<CreateCustomAudienceResponse>(
      `/${normalizedAccount}/customaudiences`,
      {
        name: input.name.trim(),
        subtype: "CUSTOM",
        description: input.description?.trim() || "Tệp khách hàng đồng bộ từ Haku Lead CRM",
        customer_file_source: "USER_PROVIDED_ONLY",
      },
    );
  } catch (error) {
    throw formatMetaAudienceError(error, normalizedAccount);
  }

  const audienceId = res.id?.trim();
  if (!audienceId) {
    throw new Error("Facebook Graph API không trả về mã Custom Audience sau khi tạo.");
  }
  return audienceId;
}

export interface SyncMetaAudienceResult {
  audienceId: string;
  adAccountId: string;
  uploadedCount: number;
  numReceived: number;
  numInvalidEntries: number;
  batches: number;
  createdNewAudience: boolean;
}

function isMissingOrInvalidAudienceError(error: unknown): boolean {
  if (!(error instanceof FacebookGraphError)) return false;
  return (
    error.status === 404 ||
    error.code === 100 ||
    error.code === 803 ||
    /does not exist|cannot be loaded|missing permissions/i.test(error.message)
  );
}

/**
 * Đẩy danh sách khách hàng (đã chuẩn hóa & băm SHA-256) lên Meta Custom Audience.
 * - Nếu chưa có `existingAudienceId` (hoặc đổi sang Ad Account khác / tệp cũ đã bị xóa trên Meta),
 *   hệ thống tự động tạo Custom Audience mới rồi đẩy từng batch 10,000 khách.
 */
export async function syncContactsToMetaCustomAudience(input: {
  adAccountId: string;
  existingAudienceId?: string | null;
  existingAdAccountId?: string | null;
  name: string;
  description?: string | null;
  contacts: AudienceContact[];
}): Promise<SyncMetaAudienceResult> {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Chưa cấu hình FACEBOOK_ACCESS_TOKEN trên hệ thống.");
  }

  const targetAdAccountId = normalizeAdAccountId(input.adAccountId || config.adAccountId);
  if (!targetAdAccountId) {
    throw new Error("Vui lòng chọn Tài khoản Quảng cáo Facebook (act_...) để đẩy tệp.");
  }

  const chunks = chunkMetaAudiencePayload(input.contacts, 10_000);
  const totalRows = chunks.reduce((sum, c) => sum + c.data.length, 0);
  if (chunks.length === 0 || totalRows === 0) {
    throw new Error("Tệp khách hàng chưa có số điện thoại hoặc email hợp lệ để đẩy lên Facebook.");
  }

  const previousAccount = normalizeAdAccountId(input.existingAdAccountId);
  const canReuseExisting =
    Boolean(input.existingAudienceId?.trim()) &&
    (!previousAccount || previousAccount === targetAdAccountId);

  let audienceId = canReuseExisting ? input.existingAudienceId!.trim() : "";
  let createdNewAudience = false;

  if (!audienceId) {
    audienceId = await createMetaCustomAudience({
      adAccountId: targetAdAccountId,
      name: input.name,
      description: input.description,
    });
    createdNewAudience = true;
  }

  let numReceived = 0;
  let numInvalidEntries = 0;

  for (let i = 0; i < chunks.length; i++) {
    const payload = chunks[i]!;
    try {
      const res = await graphPost<PushAudienceUsersResponse>(`/${audienceId}/users`, {
        payload,
      });
      numReceived += res.num_received ?? payload.data.length;
      numInvalidEntries += res.num_invalid_entries ?? 0;
    } catch (error) {
      // Nếu ở batch đầu tiên mà audience cũ đã bị xóa trên Ads Manager -> Tạo mới và thử lại
      if (i === 0 && !createdNewAudience && isMissingOrInvalidAudienceError(error)) {
        audienceId = await createMetaCustomAudience({
          adAccountId: targetAdAccountId,
          name: input.name,
          description: input.description,
        });
        createdNewAudience = true;
        const retryRes = await graphPost<PushAudienceUsersResponse>(`/${audienceId}/users`, {
          payload,
        });
        numReceived += retryRes.num_received ?? payload.data.length;
        numInvalidEntries += retryRes.num_invalid_entries ?? 0;
        continue;
      }
      throw error;
    }
  }

  return {
    audienceId,
    adAccountId: targetAdAccountId,
    uploadedCount: totalRows,
    numReceived,
    numInvalidEntries,
    batches: chunks.length,
    createdNewAudience,
  };
}
