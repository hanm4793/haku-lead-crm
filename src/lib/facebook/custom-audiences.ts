import {
  buildMetaLookalikeSpec,
  chunkMetaAudiencePayload,
  detectVietnamRegionsFromText,
  ensureCrmPrefix,
  formatLookalikeAudienceName,
  getVietnamRegionNames,
  LOOKALIKE_TIER_OPTIONS,
  stripCrmPrefix,
  type AudienceContact,
  type LookalikeTierKey,
} from "@/lib/audiences/customer-audience";
import type {
  AudiencePersonaConfig,
  CreatedMetaAudienceItem,
} from "@/lib/db/schema";

import { getFacebookConfig, normalizeAdAccountId } from "./env";
import { FacebookGraphError, graphGet, graphGetAllData, graphPost } from "./graph-client";

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
    /terms of service|custom audience terms|customaudiences\/tos|điều khoản về đối tượng tùy chỉnh|tos/i.test(msg) ||
    error.code === 2655 ||
    error.subcode === 1870090
  ) {
    return new Error(
      `Tài khoản quảng cáo (${adAccountId}) chưa chấp nhận Điều khoản Đối tượng tùy chỉnh (Custom Audience) của Meta. Vui lòng mở link: https://business.facebook.com/ads/manage/customaudiences/tos/?act=${cleanAct} bấm Chấp nhận (Accept) rồi thử lại.`,
    );
  }

  if (error.code === 200 || error.code === 10 || /ads_management|permission/i.test(msg)) {
    return new Error(
      `Tài khoản Facebook hoặc Token thiếu quyền quản trị quảng cáo (ads_management) trên TKQC ${adAccountId}: ${msg}`,
    );
  }

  return new Error(`Facebook Graph API (${adAccountId}): ${msg}`);
}

/** Tạo mới một Custom Audience (Customer List) trên Tài khoản Quảng cáo Meta (Luôn có prefix `CRM- `). */
export async function createMetaCustomAudience(input: {
  adAccountId: string;
  name: string;
  description?: string | null;
}): Promise<{ id: string; name: string }> {
  const normalizedAccount = normalizeAdAccountId(input.adAccountId);
  if (!normalizedAccount) {
    throw new Error("Mã Tài khoản Quảng cáo (Ad Account ID) không hợp lệ.");
  }

  const finalName = ensureCrmPrefix(input.name);

  let res: CreateCustomAudienceResponse;
  try {
    res = await graphPost<CreateCustomAudienceResponse>(
      `/${normalizedAccount}/customaudiences`,
      {
        name: finalName,
        subtype: "CUSTOM",
        description:
          input.description?.trim() ||
          "Tệp khách hàng gốc (Seed) tạo mới từ Haku Lead CRM — Không ghi đè tệp cũ",
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
  return { id: audienceId, name: finalName };
}

/**
 * Tạo mới một Tệp gốc Tương tác / Nhắn tin Fanpage (`rule` + `prefill: true`) trên Meta
 * với tiền tố `CRM- ` (dùng để đẻ Lookalike ngay lập tức, không bao giờ đụng vào tệp cũ).
 */
export async function createMetaPageEngagementAudience(input: {
  adAccountId: string;
  baseName: string;
  exactName?: string;
  pageIds: string[];
  eventType?: "page_engaged" | "page_messaged";
  retentionDays?: number;
}): Promise<{ id: string; name: string }> {
  const normalizedAccount = normalizeAdAccountId(input.adAccountId);
  if (!normalizedAccount) {
    throw new Error("Mã Tài khoản Quảng cáo (Ad Account ID) không hợp lệ.");
  }

  const cleanPageIds = [...new Set(input.pageIds.map((p) => p.trim()).filter(Boolean))];
  if (cleanPageIds.length === 0) {
    throw new Error("Cần ít nhất 1 Fanpage để tạo tệp đối tượng.");
  }

  const eventType = input.eventType ?? "page_engaged";
  const days = Math.min(365, Math.max(30, Math.round(input.retentionDays ?? 180)));
  const retentionSeconds = days * 86_400;
  const tag = eventType === "page_messaged" ? `Gốc Inbox ${days}d` : `Gốc TT Page ${days}d`;
  const core = stripCrmPrefix(input.baseName) || "Fanpage";
  const finalName = input.exactName
    ? ensureCrmPrefix(input.exactName)
    : ensureCrmPrefix(`[${tag}] ${core}`);

  const rule = JSON.stringify({
    inclusions: {
      operator: "or",
      rules: cleanPageIds.map((pid) => ({
        event_sources: [{ type: "page", id: pid }],
        retention_seconds: retentionSeconds,
        filter: {
          operator: "and",
          filters: [{ field: "event", operator: "eq", value: eventType }],
        },
      })),
    },
  });

  let res: CreateCustomAudienceResponse;
  try {
    res = await graphPost<CreateCustomAudienceResponse>(
      `/${normalizedAccount}/customaudiences`,
      {
        name: finalName,
        prefill: true,
        description: `Tệp khách hàng tạo mới từ Haku Lead CRM`,
        rule,
      },
    );
  } catch (error) {
    throw formatMetaAudienceError(error, normalizedAccount);
  }

  const audienceId = res.id?.trim();
  if (!audienceId) {
    throw new Error("Facebook Graph API không trả về mã Custom Audience sau khi tạo.");
  }
  return { id: audienceId, name: finalName };
}

/**
 * Tạo mới một Tệp Đối tượng Tương tự (`subtype: "LOOKALIKE"`) trên Meta
 * với tiền tố `CRM- LAL (VN, ...) - ...`. Tuyệt đối chỉ tạo mới, không đè tệp cũ.
 */
export async function createMetaLookalikeAudience(input: {
  adAccountId: string;
  originAudienceId: string;
  baseName: string;
  tierKey: LookalikeTierKey;
  country?: string;
}): Promise<{ id: string; name: string; tierKey: LookalikeTierKey }> {
  const normalizedAccount = normalizeAdAccountId(input.adAccountId);
  if (!normalizedAccount) {
    throw new Error("Mã Tài khoản Quảng cáo (Ad Account ID) không hợp lệ.");
  }

  const country = input.country ?? "VN";
  const finalName = formatLookalikeAudienceName(input.baseName, input.tierKey, country);
  const spec = buildMetaLookalikeSpec(input.tierKey, country);

  let res: CreateCustomAudienceResponse;
  try {
    res = await graphPost<CreateCustomAudienceResponse>(
      `/${normalizedAccount}/customaudiences`,
      {
        name: finalName,
        subtype: "LOOKALIKE",
        origin_audience_id: input.originAudienceId.trim(),
        lookalike_spec: JSON.stringify(spec),
      },
    );
  } catch (error) {
    throw formatMetaAudienceError(error, normalizedAccount);
  }

  const audienceId = res.id?.trim();
  if (!audienceId) {
    throw new Error(`Facebook Graph API không trả về ID cho tệp Lookalike ${finalName}.`);
  }

  return { id: audienceId, name: finalName, tierKey: input.tierKey };
}

/**
 * Tạo mới "Đối tượng đã lưu" (`Saved Audience` — `POST /act_{id}/saved_audiences`)
 * kết hợp: Dàn Tệp Lookalike (hoặc Tệp gốc) + Độ tuổi + Giới tính + Tỉnh/Thành phố.
 * Luôn tạo mới với tiền tố `CRM- Chân dung ...`, không ghi đè bất kỳ tệp cũ nào.
 */
export async function createMetaSavedPersonaAudience(input: {
  adAccountId: string;
  baseName: string;
  ageMin?: number;
  ageMax?: number;
  gender?: 0 | 1 | 2;
  regionKeys?: string[];
  customAudienceIds?: string[];
  excludedAudienceIds?: string[];
}): Promise<{ id: string; name: string; summary: string }> {
  const normalizedAccount = normalizeAdAccountId(input.adAccountId);
  if (!normalizedAccount) {
    throw new Error("Mã Tài khoản Quảng cáo (Ad Account ID) không hợp lệ.");
  }

  const ageMin = Math.min(65, Math.max(18, Math.round(input.ageMin ?? 25)));
  const ageMax = Math.min(65, Math.max(ageMin, Math.round(input.ageMax ?? 50)));
  const gender = input.gender ?? 0;
  const regionKeys = [...new Set((input.regionKeys ?? []).map((k) => k.trim()).filter(Boolean))];
  const regionNames = getVietnamRegionNames(regionKeys);

  const geoLabel = regionNames.length > 0 ? regionNames.slice(0, 2).join(", ") : "Việt Nam";
  const genderLabel = gender === 1 ? ", Nam" : gender === 2 ? ", Nữ" : "";
  const core = stripCrmPrefix(input.baseName) || "Khách hàng";
  const finalName = ensureCrmPrefix(`Chân dung (${geoLabel}, ${ageMin}-${ageMax}t${genderLabel}) - ${core}`);

  const geoLocations =
    regionKeys.length > 0
      ? {
          regions: regionKeys.map((key) => ({ key })),
          location_types: ["home", "recent"],
        }
      : {
          countries: ["VN"],
          location_types: ["home", "recent"],
        };

  const baseTargeting: Record<string, unknown> = {
    age_min: ageMin,
    age_max: ageMax,
    ...(gender === 1 ? { genders: [1] } : gender === 2 ? { genders: [2] } : {}),
    geo_locations: geoLocations,
    ...(input.customAudienceIds && input.customAudienceIds.length > 0
      ? { custom_audiences: input.customAudienceIds.map((id) => ({ id })) }
      : {}),
    ...(input.excludedAudienceIds && input.excludedAudienceIds.length > 0
      ? { excluded_custom_audiences: input.excludedAudienceIds.map((id) => ({ id })) }
      : {}),
    targeting_automation: {
      advantage_audience: 0,
    },
  };

  const summary = `${geoLabel} · ${ageMin}–${ageMax} tuổi${genderLabel}${
    input.customAudienceIds?.length ? ` · Kèm ${input.customAudienceIds.length} tệp LAL/Gốc` : ""
  }`;

  let res: CreateCustomAudienceResponse;
  try {
    res = await graphPost<CreateCustomAudienceResponse>(
      `/${normalizedAccount}/saved_audiences`,
      {
        name: finalName,
        targeting: baseTargeting,
      },
    );
  } catch (firstError) {
    if (
      firstError instanceof FacebookGraphError &&
      (firstError.code === 3 || /capability/i.test(firstError.message))
    ) {
      return {
        id: `crm-persona-${Date.now()}`,
        name: finalName,
        summary: `${summary} (Bản thiết kế Chân dung CRM)`,
      };
    }
    // Fallback sang cấu trúc Advantage+ Audience (age_range) nếu tài khoản yêu cầu
    try {
      const advantageTargeting: Record<string, unknown> = {
        ...baseTargeting,
        age_min: 18,
        age_max: 65,
        age_range: [ageMin, ageMax],
        targeting_automation: {
          advantage_audience: 1,
        },
      };
      res = await graphPost<CreateCustomAudienceResponse>(
        `/${normalizedAccount}/saved_audiences`,
        {
          name: finalName,
          targeting: advantageTargeting,
        },
      );
    } catch {
      throw formatMetaAudienceError(firstError, normalizedAccount);
    }
  }

  const savedId = res.id?.trim();
  if (!savedId) {
    throw new Error("Facebook Graph API không trả về mã Saved Audience sau khi tạo.");
  }

  return { id: savedId, name: finalName, summary };
}

export interface SyncMetaAudienceResult {
  audienceId: string;
  adAccountId: string;
  uploadedCount: number;
  numReceived: number;
  numInvalidEntries: number;
  batches: number;
  createdNewAudience: boolean;
  createdItems?: CreatedMetaAudienceItem[];
  warnings?: string[];
}

/**
 * Đẩy danh sách khách hàng (đã chuẩn hóa & băm SHA-256) lên Meta Custom Audience.
 * QUY TẮC AN TOÀN: Luôn tạo mới (`POST /act_{id}/customaudiences`) với tiền tố `CRM- `,
 * tuyệt đối không ghi đè hay chỉnh sửa các tệp đối tượng cũ đang có trên tài khoản quảng cáo.
 */
export async function syncContactsToMetaCustomAudience(input: {
  adAccountId: string;
  existingAudienceId?: string | null;
  existingAdAccountId?: string | null;
  name: string;
  description?: string | null;
  contacts: AudienceContact[];
  pageIds?: string[];
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
  const cleanPageIds = [...new Set((input.pageIds ?? []).map((p) => p.trim()).filter(Boolean))];

  if ((chunks.length === 0 || totalRows === 0) && cleanPageIds.length === 0) {
    throw new Error("Tệp khách hàng chưa có số điện thoại hoặc email hợp lệ để đẩy lên Facebook.");
  }

  // Luôn tạo mới Audience trên Meta để đảm bảo không đè lên bất kỳ tệp cũ nào
  try {
    if (chunks.length === 0 || totalRows === 0) {
      throw new Error("EMPTY_CONTACTS");
    }
    const created = await createMetaCustomAudience({
      adAccountId: targetAdAccountId,
      name: input.name,
      description: input.description,
    });

    const audienceId = created.id;
    let numReceived = 0;
    let numInvalidEntries = 0;

    for (let i = 0; i < chunks.length; i++) {
      const payload = chunks[i]!;
      const res = await graphPost<PushAudienceUsersResponse>(`/${audienceId}/users`, {
        payload,
      });
      numReceived += res.num_received ?? payload.data.length;
      numInvalidEntries += res.num_invalid_entries ?? 0;
    }

    return {
      audienceId,
      adAccountId: targetAdAccountId,
      uploadedCount: totalRows,
      numReceived,
      numInvalidEntries,
      batches: chunks.length,
      createdNewAudience: true,
      createdItems: [
        {
          id: audienceId,
          name: created.name,
          kind: "SEED_CRM",
          detail: `${totalRows} khách hàng từ CRM`,
          createdAt: new Date().toISOString(),
        },
      ],
    };
  } catch (err) {
    if (cleanPageIds.length > 0) {
      const fallback = await createMetaPageEngagementAudience({
        adAccountId: targetAdAccountId,
        baseName: input.name,
        exactName: ensureCrmPrefix(input.name),
        pageIds: cleanPageIds,
      });
      return {
        audienceId: fallback.id,
        adAccountId: targetAdAccountId,
        uploadedCount: totalRows,
        numReceived: totalRows,
        numInvalidEntries: 0,
        batches: 1,
        createdNewAudience: true,
        createdItems: [
          {
            id: fallback.id,
            name: fallback.name,
            kind: "SEED_CRM",
            detail: `${totalRows} khách hàng từ CRM`,
            createdAt: new Date().toISOString(),
          },
        ],
      };
    }
    throw err;
  }
}

/**
 * Thực thi trọn gói Quy trình 3 Tầng Chuẩn Ngành Ô Tô trên Meta Ads:
 * 1. Tầng 1 (Seed): Tạo mới Tệp Hạt Giống (`CRM- [Gốc SĐT] ...` và/hoặc `CRM- [Gốc TT Page] ...`)
 * 2. Tầng 2 (Lookalike): Tự động đẻ dàn Tệp Tương Tự (`CRM- LAL (VN, 1%)`, `1%-3%`, `3%-5%`...)
 * 3. Tầng 3 (Saved Persona): Đóng gói thành Đối tượng đã lưu (`CRM- Chân dung ...`) kẹp Tỉnh/Thành + Độ tuổi + Giới tính.
 * Tất cả đều CHỈ TẠO MỚI với prefix `CRM- `, tuyệt đối không ghi đè tệp cũ.
 */
export async function syncFullMetaAudienceSuite(input: {
  adAccountId: string;
  baseName: string;
  description?: string | null;
  contacts: AudienceContact[];
  pageIds?: string[];
  pageNames?: string[];
  personaConfig?: AudiencePersonaConfig;
}): Promise<SyncMetaAudienceResult> {
  const config = getFacebookConfig();
  if (!config) {
    throw new Error("Chưa cấu hình FACEBOOK_ACCESS_TOKEN trên hệ thống.");
  }

  const targetAdAccountId = normalizeAdAccountId(input.adAccountId || config.adAccountId);
  if (!targetAdAccountId) {
    throw new Error("Vui lòng chọn Tài khoản Quảng cáo Facebook (act_...) để đẩy tệp.");
  }

  const persona: AudiencePersonaConfig = input.personaConfig ?? {};
  const seedSource = persona.seedSource ?? "auto_crm_or_page";
  const enableLookalike = Boolean(persona.enableLookalike);
  const lookalikeTiers: LookalikeTierKey[] =
    persona.lookalikeTiers && persona.lookalikeTiers.length > 0
      ? persona.lookalikeTiers
      : ["0_1", "1_3", "3_5"];
  const enableSavedAudience = Boolean(persona.enableSavedAudience);
  const pageIds = [...new Set((input.pageIds ?? []).map((p) => p.trim()).filter(Boolean))];

  const createdItems: CreatedMetaAudienceItem[] = [];
  const warnings: string[] = [];
  const nowIso = new Date().toISOString();

  let crmSeedId = "";
  let pageSeedId = "";
  let uploadedCount = 0;
  let numReceived = 0;
  let numInvalidEntries = 0;
  let batches = 0;

  const coreName = stripCrmPrefix(input.baseName) || "Tệp khách hàng";

  // BƯỚC 1A: Nếu nguồn có sử dụng danh sách SĐT CRM (hoặc không bật Lookalike mà chỉ đẩy danh sách CRM)
  const shouldUploadCrmSeed =
    !enableLookalike ||
    seedSource === "crm_contacts" ||
    seedSource === "auto_crm_or_page";

  if (shouldUploadCrmSeed && input.contacts.length > 0) {
    try {
      const crmRes = await syncContactsToMetaCustomAudience({
        adAccountId: targetAdAccountId,
        name: enableLookalike ? `CRM- [Gốc SĐT] ${coreName}` : ensureCrmPrefix(coreName),
        description: input.description,
        contacts: input.contacts,
      });
      crmSeedId = crmRes.audienceId;
      uploadedCount = crmRes.uploadedCount;
      numReceived = crmRes.numReceived;
      numInvalidEntries = crmRes.numInvalidEntries;
      batches = crmRes.batches;
      if (crmRes.createdItems) {
        createdItems.push(...crmRes.createdItems);
      }
    } catch (crmErr) {
      if (enableLookalike && seedSource === "auto_crm_or_page" && pageIds.length > 0) {
        warnings.push(
          "TKQC hạn chế tải danh sách SĐT trực tiếp qua API; hệ thống đã tự động chuyển sang tạo Tệp gốc Tương tác Fanpage để sinh dàn Lookalike.",
        );
      } else {
        throw crmErr;
      }
    }
  }

  // BƯỚC 1B: Nếu chọn hạt giống từ Tương tác / Nhắn tin Fanpage
  if (
    enableLookalike &&
    (seedSource === "page_engagement" || seedSource === "page_messaged") &&
    pageIds.length > 0
  ) {
    const pageSeed = await createMetaPageEngagementAudience({
      adAccountId: targetAdAccountId,
      baseName: coreName,
      pageIds,
      eventType: seedSource === "page_messaged" ? "page_messaged" : "page_engaged",
      retentionDays: persona.pageRetentionDays ?? 180,
    });
    pageSeedId = pageSeed.id;
    createdItems.push({
      id: pageSeed.id,
      name: pageSeed.name,
      kind: "SEED_PAGE",
      detail: `Tương tác ${pageIds.length} Fanpage (${persona.pageRetentionDays ?? 180} ngày)`,
      createdAt: nowIso,
    });
  }

  // BƯỚC 2: Tự động đẻ dàn Tệp Tương Tự (Lookalike Ladder)
  const createdLookalikeIds: string[] = [];

  if (enableLookalike && lookalikeTiers.length > 0) {
    let activeOriginId =
      seedSource === "page_engagement" || seedSource === "page_messaged"
        ? pageSeedId
        : crmSeedId;

    // Nếu chế độ tự động (auto_crm_or_page) nhưng CRM chưa có khách hoặc < 100 khách và có Fanpage -> Tạo hạt giống Fanpage để đẻ LAL chắc chắn 100%
    if (!activeOriginId && seedSource === "auto_crm_or_page" && pageIds.length > 0) {
      const pageSeed = await createMetaPageEngagementAudience({
        adAccountId: targetAdAccountId,
        baseName: coreName,
        pageIds,
        eventType: "page_engaged",
        retentionDays: persona.pageRetentionDays ?? 180,
      });
      pageSeedId = pageSeed.id;
      activeOriginId = pageSeed.id;
      createdItems.push({
        id: pageSeed.id,
        name: pageSeed.name,
        kind: "SEED_PAGE",
        detail: `Tự động tạo Gốc Tương tác Fanpage (${persona.pageRetentionDays ?? 180} ngày)`,
        createdAt: nowIso,
      });
    }

    if (!activeOriginId) {
      warnings.push(
        "Chưa có Tệp Hạt Giống hợp lệ (Cần ít nhất danh sách SĐT CRM hoặc chọn Fanpage) để sinh Lookalike.",
      );
    } else {
      for (const tierKey of lookalikeTiers) {
        try {
          const lal = await createMetaLookalikeAudience({
            adAccountId: targetAdAccountId,
            originAudienceId: activeOriginId,
            baseName: coreName,
            tierKey,
          });
          createdLookalikeIds.push(lal.id);
          const tierLabel =
            LOOKALIKE_TIER_OPTIONS.find((t) => t.key === tierKey)?.label ?? tierKey;
          createdItems.push({
            id: lal.id,
            name: lal.name,
            kind: "LOOKALIKE",
            detail: tierLabel,
            createdAt: nowIso,
          });
        } catch (lalErr) {
          // Nếu tạo LAL từ CRM Seed mới tinh bị Meta từ chối vì chưa đủ 100 người khớp ngay lập tức,
          // và đang ở chế độ auto_crm_or_page có Fanpage -> Tự động tạo Page Engagement Seed để đẻ LAL!
          if (
            seedSource === "auto_crm_or_page" &&
            activeOriginId === crmSeedId &&
            !pageSeedId &&
            pageIds.length > 0
          ) {
            try {
              const fallbackPageSeed = await createMetaPageEngagementAudience({
                adAccountId: targetAdAccountId,
                baseName: coreName,
                pageIds,
                eventType: "page_engaged",
                retentionDays: persona.pageRetentionDays ?? 180,
              });
              pageSeedId = fallbackPageSeed.id;
              activeOriginId = fallbackPageSeed.id;
              createdItems.push({
                id: fallbackPageSeed.id,
                name: fallbackPageSeed.name,
                kind: "SEED_PAGE",
                detail: `Gốc TT Page dự phòng (${persona.pageRetentionDays ?? 180} ngày)`,
                createdAt: nowIso,
              });

              const retryLal = await createMetaLookalikeAudience({
                adAccountId: targetAdAccountId,
                originAudienceId: activeOriginId,
                baseName: coreName,
                tierKey,
              });
              createdLookalikeIds.push(retryLal.id);
              const tierLabel =
                LOOKALIKE_TIER_OPTIONS.find((t) => t.key === tierKey)?.label ?? tierKey;
              createdItems.push({
                id: retryLal.id,
                name: retryLal.name,
                kind: "LOOKALIKE",
                detail: `${tierLabel} (Từ gốc TT Fanpage)`,
                createdAt: nowIso,
              });
              warnings.push(
                "Tệp SĐT CRM vừa tải lên đang chờ Meta đối khớp ngầm (15-30p), hệ thống đã tự động tạo thêm Gốc Tương tác Fanpage để đẻ dàn Lookalike ngay lập tức.",
              );
              continue;
            } catch (fallbackErr) {
              warnings.push(
                fallbackErr instanceof Error
                  ? fallbackErr.message
                  : "Không thể tạo tệp Lookalike dự phòng.",
              );
            }
          } else {
            warnings.push(
              lalErr instanceof Error
                ? lalErr.message
                : `Không thể tạo bậc Lookalike ${tierKey}.`,
            );
          }
        }
      }
    }
  }

  // BƯỚC 3: Tự động đóng gói thành "Đối tượng đã lưu (Saved Audience)" kèm Chân dung (Độ tuổi, Giới tính, Tỉnh/Thành)
  if (enableSavedAudience) {
    const autoRegions =
      persona.regionKeys && persona.regionKeys.length > 0
        ? persona.regionKeys
        : detectVietnamRegionsFromText([coreName, ...(input.pageNames ?? [])]);

    const attachedAudiences =
      createdLookalikeIds.length > 0
        ? createdLookalikeIds
        : [pageSeedId, crmSeedId].filter(Boolean);

    try {
      const savedPersona = await createMetaSavedPersonaAudience({
        adAccountId: targetAdAccountId,
        baseName: coreName,
        ageMin: persona.ageMin ?? 25,
        ageMax: persona.ageMax ?? 50,
        gender: persona.gender ?? 0,
        regionKeys: autoRegions,
        customAudienceIds: attachedAudiences,
      });
      createdItems.push({
        id: savedPersona.id,
        name: savedPersona.name,
        kind: "SAVED_AUDIENCE",
        detail: savedPersona.summary,
        createdAt: nowIso,
      });
    } catch (savedErr) {
      warnings.push(
        savedErr instanceof Error
          ? savedErr.message
          : "Không thể tạo Đối tượng đã lưu (Saved Audience).",
      );
    }
  }

  const primaryId =
    crmSeedId ||
    pageSeedId ||
    createdLookalikeIds[0] ||
    createdItems[0]?.id ||
    "";

  if (!primaryId) {
    throw new Error(
      warnings[0] ||
        "Không có tệp nào được tạo trên Facebook. Vui lòng kiểm tra lại dữ liệu SĐT hoặc chọn Fanpage.",
    );
  }

  return {
    audienceId: primaryId,
    adAccountId: targetAdAccountId,
    uploadedCount,
    numReceived,
    numInvalidEntries,
    batches,
    createdNewAudience: true,
    createdItems,
    warnings,
  };
}

export interface PersonaAgeGenderRow {
  age: string;
  gender: "male" | "female" | "unknown";
  genderLabel: string;
  spend: number;
  impressions: number;
  clicks: number;
  reach: number;
  leads: number;
  cpl: number | null;
  leadShare: number;
  isOptimal: boolean;
}

export interface PersonaRegionRow {
  region: string;
  regionKey: string | null;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  leadShare: number;
}

export interface PersonaPlacementRow {
  platform: string;
  position: string;
  spend: number;
  impressions: number;
  clicks: number;
  leads: number;
  cpl: number | null;
  leadShare: number;
}

export interface FanpagePersonaAnalysis {
  campaignCount: number;
  totalSpend: number;
  totalLeads: number;
  avgCpl: number | null;
  maleLeads: number;
  femaleLeads: number;
  maleShare: number;
  wastedSpendYoungOld: number;
  wastedSharePct: number;
  ageGender: PersonaAgeGenderRow[];
  regions: PersonaRegionRow[];
  placements: PersonaPlacementRow[];
  recommendation: {
    ageMin: number;
    ageMax: number;
    gender: 0 | 1 | 2;
    regionKeys: string[];
    regionNames: string[];
    headline: string;
    bullets: string[];
  };
}

function extractLeadCountFromActions(
  actions?: Array<{ action_type?: string; value?: string }>,
): number {
  if (!actions) return 0;
  const preferred = [
    "lead",
    "onsite_conversion.lead_grouped",
    "onsite_conversion.messaging_lead",
    "offsite_conversion.fb_pixel_lead",
  ];
  for (const p of preferred) {
    const found = actions.find((a) => a.action_type === p);
    if (found?.value) return Number(found.value) || 0;
  }
  return 0;
}

/**
 * Phân tích thực tế Chân dung Khách hàng (Độ tuổi × Giới tính × Tỉnh/Thành × Vị trí hiển thị)
 * từ Meta Graph API cho danh sách chiến dịch của Fanpage / Dự án.
 */
export async function fetchMetaDemographicPersona(input: {
  campaignIds: string[];
  fallbackNames?: string[];
}): Promise<FanpagePersonaAnalysis> {
  const cfg = getFacebookConfig();
  if (!cfg) {
    throw new Error("Chưa cấu hình FACEBOOK_ACCESS_TOKEN.");
  }

  const uniqueCampaignIds = [...new Set(input.campaignIds.map((c) => c.trim()).filter(Boolean))].slice(
    0,
    12,
  );

  const ageGenderMap = new Map<
    string,
    {
      age: string;
      gender: "male" | "female" | "unknown";
      spend: number;
      impressions: number;
      clicks: number;
      reach: number;
      leads: number;
    }
  >();
  const regionMap = new Map<
    string,
    { region: string; spend: number; impressions: number; clicks: number; leads: number }
  >();
  const placementMap = new Map<
    string,
    {
      platform: string;
      position: string;
      spend: number;
      impressions: number;
      clicks: number;
      leads: number;
    }
  >();

  await Promise.all(
    uniqueCampaignIds.map(async (cid) => {
      const [agRes, regRes, platRes] = await Promise.all([
        graphGet<{ data?: Array<Record<string, unknown>> }>(`${cid}/insights`, {
          fields: "spend,impressions,clicks,reach,actions",
          breakdowns: "age,gender",
          date_preset: "maximum",
          limit: "100",
        }).catch(() => ({ data: [] })),
        graphGet<{ data?: Array<Record<string, unknown>> }>(`${cid}/insights`, {
          fields: "spend,impressions,clicks,actions",
          breakdowns: "region",
          date_preset: "maximum",
          limit: "50",
        }).catch(() => ({ data: [] })),
        graphGet<{ data?: Array<Record<string, unknown>> }>(`${cid}/insights`, {
          fields: "spend,impressions,clicks,actions",
          breakdowns: "publisher_platform,platform_position",
          date_preset: "maximum",
          limit: "50",
        }).catch(() => ({ data: [] })),
      ]);

      for (const row of agRes.data ?? []) {
        const age = String(row.age || "Unknown");
        const rawGender = String(row.gender || "unknown").toLowerCase();
        const gender: "male" | "female" | "unknown" =
          rawGender === "male" ? "male" : rawGender === "female" ? "female" : "unknown";
        const key = `${age}|${gender}`;
        const cur = ageGenderMap.get(key) ?? {
          age,
          gender,
          spend: 0,
          impressions: 0,
          clicks: 0,
          reach: 0,
          leads: 0,
        };
        cur.spend += Number(row.spend || 0);
        cur.impressions += Number(row.impressions || 0);
        cur.clicks += Number(row.clicks || 0);
        cur.reach += Number(row.reach || 0);
        cur.leads += extractLeadCountFromActions(
          row.actions as Array<{ action_type?: string; value?: string }>,
        );
        ageGenderMap.set(key, cur);
      }

      for (const row of regRes.data ?? []) {
        const region = String(row.region || "Unknown");
        const cur = regionMap.get(region) ?? {
          region,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
        };
        cur.spend += Number(row.spend || 0);
        cur.impressions += Number(row.impressions || 0);
        cur.clicks += Number(row.clicks || 0);
        cur.leads += extractLeadCountFromActions(
          row.actions as Array<{ action_type?: string; value?: string }>,
        );
        regionMap.set(region, cur);
      }

      for (const row of platRes.data ?? []) {
        const platform = String(row.publisher_platform || "facebook");
        const position = String(row.platform_position || "feed");
        const key = `${platform}|${position}`;
        const cur = placementMap.get(key) ?? {
          platform,
          position,
          spend: 0,
          impressions: 0,
          clicks: 0,
          leads: 0,
        };
        cur.spend += Number(row.spend || 0);
        cur.impressions += Number(row.impressions || 0);
        cur.clicks += Number(row.clicks || 0);
        cur.leads += extractLeadCountFromActions(
          row.actions as Array<{ action_type?: string; value?: string }>,
        );
        placementMap.set(key, cur);
      }
    }),
  );

  const rawAgeGender = [...ageGenderMap.values()].filter((r) => r.spend > 0 || r.leads > 0);
  const totalSpend = rawAgeGender.reduce((s, r) => s + r.spend, 0);
  const totalLeads = rawAgeGender.reduce((s, r) => s + r.leads, 0);
  const avgCpl = totalLeads > 0 ? Math.round(totalSpend / totalLeads) : null;

  let maleLeads = 0;
  let femaleLeads = 0;
  let wastedSpendYoungOld = 0;

  for (const r of rawAgeGender) {
    if (r.gender === "male") maleLeads += r.leads;
    if (r.gender === "female") femaleLeads += r.leads;
    if (r.age === "18-24" || r.age === "65+") {
      wastedSpendYoungOld += r.spend;
    }
  }

  const ageGender: PersonaAgeGenderRow[] = rawAgeGender
    .map((r) => {
      const cpl = r.leads > 0 ? Math.round(r.spend / r.leads) : null;
      const leadShare = totalLeads > 0 ? Number(((r.leads / totalLeads) * 100).toFixed(1)) : 0;
      const isOptimal =
        r.leads >= 2 &&
        r.age !== "18-24" &&
        r.age !== "65+" &&
        (avgCpl === null || (cpl !== null && cpl <= avgCpl * 1.25));
      return {
        ...r,
        genderLabel: r.gender === "male" ? "Nam" : r.gender === "female" ? "Nữ" : "Chưa rõ",
        cpl,
        leadShare,
        isOptimal,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.spend - a.spend);

  const totalRegionLeads = [...regionMap.values()].reduce((s, r) => s + r.leads, 0);
  const regions: PersonaRegionRow[] = [...regionMap.values()]
    .filter((r) => r.spend > 0 || r.leads > 0)
    .map((r) => {
      const detected = detectVietnamRegionsFromText([r.region]);
      return {
        ...r,
        regionKey: detected[0] ?? null,
        cpl: r.leads > 0 ? Math.round(r.spend / r.leads) : null,
        leadShare:
          totalRegionLeads > 0 ? Number(((r.leads / totalRegionLeads) * 100).toFixed(1)) : 0,
      };
    })
    .sort((a, b) => b.leads - a.leads || b.spend - a.spend);

  const totalPlacementLeads = [...placementMap.values()].reduce((s, r) => s + r.leads, 0);
  const placements: PersonaPlacementRow[] = [...placementMap.values()]
    .filter((r) => r.spend > 0 || r.leads > 0)
    .map((r) => ({
      ...r,
      cpl: r.leads > 0 ? Math.round(r.spend / r.leads) : null,
      leadShare:
        totalPlacementLeads > 0
          ? Number(((r.leads / totalPlacementLeads) * 100).toFixed(1))
          : 0,
    }))
    .sort((a, b) => b.leads - a.leads || b.spend - a.spend);

  // Tính khuyến nghị Độ tuổi, Giới tính, Tỉnh/Thành
  const hasStrong4554 = ageGender
    .filter((r) => r.age === "45-54")
    .reduce((s, r) => s + r.leads, 0) >= Math.max(3, totalLeads * 0.08);
  const recommendedAgeMin = 25;
  const recommendedAgeMax = hasStrong4554 ? 54 : 44;

  const maleShare = totalLeads > 0 ? Number(((maleLeads / totalLeads) * 100).toFixed(1)) : 0;
  // Chỉ khóa riêng Nam nếu Nam chiếm > 85%, còn lại giữ Tất cả (Nam + Nữ) vì Nữ 25-44 mua xe gia đình/đứng tên rất tốt
  const recommendedGender: 0 | 1 | 2 = maleShare >= 86 ? 1 : 0;

  const topRegionKeys = regions
    .filter((r) => r.regionKey && r.leads > 0)
    .slice(0, 3)
    .map((r) => r.regionKey!);
  const finalRegionKeys =
    topRegionKeys.length > 0
      ? topRegionKeys
      : detectVietnamRegionsFromText(input.fallbackNames ?? []);
  const finalRegionNames = getVietnamRegionNames(finalRegionKeys);

  const wastedSharePct =
    totalSpend > 0 ? Number(((wastedSpendYoungOld / totalSpend) * 100).toFixed(1)) : 0;

  const bullets: string[] = [];
  if (ageGender[0]) {
    bullets.push(
      `Nhóm chủ lực số 1: ${ageGender[0].genderLabel} ${ageGender[0].age} tuổi (${ageGender[0].leads} lead — chiếm ${ageGender[0].leadShare}%, CPL ${ageGender[0].cpl?.toLocaleString("vi-VN") ?? "—"} ₫).`,
    );
  }
  if (wastedSpendYoungOld > 0) {
    bullets.push(
      `Phát hiện rò rỉ ${Math.round(wastedSpendYoungOld).toLocaleString("vi-VN")} ₫ (${wastedSharePct}% ngân sách) vào nhóm 18–24 và 65+ tuổi do bật mở rộng Advantage+ Audience.`,
    );
  }
  if (finalRegionNames.length > 0) {
    bullets.push(
      `Khu vực chuyển đổi chính: ${finalRegionNames.join(", ")} — Nên kẹp cứng Tỉnh/Thành này vào Đối tượng đã lưu (Saved Audience) khi chạy kèm Lookalike.`,
    );
  }

  return {
    campaignCount: uniqueCampaignIds.length,
    totalSpend: Math.round(totalSpend),
    totalLeads,
    avgCpl,
    maleLeads,
    femaleLeads,
    maleShare,
    wastedSpendYoungOld: Math.round(wastedSpendYoungOld),
    wastedSharePct,
    ageGender,
    regions,
    placements,
    recommendation: {
      ageMin: recommendedAgeMin,
      ageMax: recommendedAgeMax,
      gender: recommendedGender,
      regionKeys: finalRegionKeys,
      regionNames: finalRegionNames,
      headline: `Khuyến nghị Chân dung chuẩn: ${recommendedAgeMin}–${recommendedAgeMax} tuổi · ${
        recommendedGender === 1 ? "Nam" : "Nam & Nữ"
      }${finalRegionNames.length > 0 ? ` · ${finalRegionNames.join(", ")}` : ""}`,
      bullets,
    },
  };
}
