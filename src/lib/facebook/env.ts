export type FacebookConfig = {
  token: string;
  /** All Page IDs to sync Lead Ads from (at least one). */
  pageIds: string[];
  /** First page id — convenience for callers that only need one. */
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

export function getFacebookConfig(): FacebookConfig | null {
  const token = nonEmpty(process.env.FACEBOOK_ACCESS_TOKEN);
  const pageIds = parseFacebookPageIds();
  if (!token || pageIds.length === 0) return null;

  const adAccountId = normalizeAdAccountId(process.env.FACEBOOK_AD_ACCOUNT_ID);
  const graphVersion = nonEmpty(process.env.FACEBOOK_GRAPH_VERSION) ?? "v21.0";

  return { token, pageIds, pageId: pageIds[0]!, adAccountId, graphVersion };
}
