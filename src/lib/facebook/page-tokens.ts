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
