export type FacebookConfig = {
  token: string;
  /** Page IDs from env (bootstrap). Runtime sync prefers DB `facebook_pages`. */
  pageIds: string[];
  pageId: string;
  adAccountId: string | null;
  graphVersion: string;
};

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

/** Accept `FACEBOOK_PAGE_ID` and/or comma-separated `FACEBOOK_PAGE_IDS`. */
export function parseFacebookPageIds(
  pageId = process.env.FACEBOOK_PAGE_ID,
  pageIds = process.env.FACEBOOK_PAGE_IDS,
): string[] {
  const chunks = [pageIds, pageId]
    .filter((value): value is string => Boolean(value && value.trim()))
    .flatMap((value) => value.split(/[,;\s]+/));
  return [...new Set(chunks.map((value) => value.trim()).filter(Boolean))];
}

/** Ads Manager shows a bare number; Graph expects `act_…`. */
export function normalizeAdAccountId(value: string | null | undefined): string | null {
  const id = nonEmpty(value ?? undefined);
  if (!id) return null;
  return id.startsWith("act_") ? id : `act_${id}`;
}

export function isFacebookTokenConfigured(): boolean {
  return Boolean(nonEmpty(process.env.FACEBOOK_ACCESS_TOKEN));
}

/**
 * Token bắt buộc. Page có thể nằm trong DB (`facebook_pages`) thay vì env —
 * khi đó `pageIds` từ env có thể rỗng.
 */
export function getFacebookConfig(): FacebookConfig | null {
  const token = nonEmpty(process.env.FACEBOOK_ACCESS_TOKEN);
  if (!token) return null;

  const pageIds = parseFacebookPageIds();
  const adAccountId = normalizeAdAccountId(process.env.FACEBOOK_AD_ACCOUNT_ID);
  const graphVersion = nonEmpty(process.env.FACEBOOK_GRAPH_VERSION) ?? "v21.0";

  return { token, pageIds, pageId: pageIds[0] ?? "", adAccountId, graphVersion };
}
