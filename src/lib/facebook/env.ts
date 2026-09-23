export type FacebookConfig = {
  token: string;
  pageId: string;
  adAccountId: string | null;
  graphVersion: string;
};

function nonEmpty(value: string | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed && trimmed.length > 0 ? trimmed : null;
}

export function getFacebookConfig(): FacebookConfig | null {
  const token = nonEmpty(process.env.FACEBOOK_ACCESS_TOKEN);
  const pageId = nonEmpty(process.env.FACEBOOK_PAGE_ID);
  if (!token || !pageId) return null;

  const adAccountId = nonEmpty(process.env.FACEBOOK_AD_ACCOUNT_ID);
  const graphVersion = nonEmpty(process.env.FACEBOOK_GRAPH_VERSION) ?? "v21.0";

  return { token, pageId, adAccountId, graphVersion };
}
