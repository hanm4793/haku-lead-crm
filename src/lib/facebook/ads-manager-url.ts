/** Deep link Ads Manager. `act` là số tài khoản, không kèm tiền tố `act_`. */
export function adsManagerUrl(
  level: "campaign" | "ad",
  objectId: string,
  adAccountId: string | null | undefined,
): string | null {
  const act = adAccountId?.trim().replace(/^act_/, "");
  const id = objectId.trim();
  if (!act || !id) return null;

  const url = new URL(
    `https://adsmanager.facebook.com/adsmanager/manage/${level === "campaign" ? "campaigns" : "ads"}`,
  );
  url.searchParams.set("act", act);
  url.searchParams.set(level === "campaign" ? "selected_campaign_ids" : "selected_ad_ids", id);
  return url.toString();
}
