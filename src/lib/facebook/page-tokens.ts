import { graphGetAllData } from "./graph-client";

export type PageAccessToken = {
  token: string;
  name: string | null;
};

type MeAccount = {
  id: string;
  name?: string;
  access_token?: string;
};

/** Map Page ID → Page Access Token from `/me/accounts` (User token). */
export async function resolvePageAccessTokens(
  pageIds: string[],
): Promise<Map<string, PageAccessToken>> {
  const wanted = new Set(pageIds);
  const result = new Map<string, PageAccessToken>();
  if (wanted.size === 0) return result;

  const accounts = await graphGetAllData<MeAccount>("/me/accounts", {
    fields: "id,name,access_token",
    limit: "100",
  });

  for (const account of accounts) {
    if (!wanted.has(account.id)) continue;
    const token = account.access_token?.trim();
    if (!token) continue;
    result.set(account.id, {
      token,
      name: account.name?.trim() || null,
    });
  }

  return result;
}

export type AccessiblePage = { id: string; name: string | null };

/** Các Fanpage cá nhân của tài khoản giữ token — không hiển thị và không đồng bộ vào CRM. */
export const EXCLUDED_PERSONAL_PAGE_IDS = new Set([
  "103597434588174", // Đồ ăn vặt Tây Bắc
  "104118637867183", // Đồ Ăn Vặt Ba Miền - Taybacagri
  "1533869620218743", // Maruko manga shop
  "430772920297064", // Bibi Shop
  "179708925993330", // Nghiện game cổ
  "200427243878499", // Timer FC
]);

export function isPersonalFacebookPage(pageId: string, name?: string | null): boolean {
  if (EXCLUDED_PERSONAL_PAGE_IDS.has(pageId.trim())) return true;
  if (name && /mạnh\s*hà|manh\s*ha|ăn\s*vặt|taybacagri|maruko|bibi\s*shop|nghiện\s*game|timer\s*fc/i.test(name)) {
    return true;
  }
  return false;
}

/** Fanpage mà tài khoản của FACEBOOK_ACCESS_TOKEN đang có quyền (qua `/me/accounts`). */
export async function listAccessiblePages(): Promise<AccessiblePage[]> {
  const accounts = await graphGetAllData<MeAccount>("/me/accounts", {
    fields: "id,name",
    limit: "100",
  });
  return accounts
    .filter((account) => !isPersonalFacebookPage(account.id, account.name))
    .map((account) => ({ id: account.id, name: account.name?.trim() || null }));
}
