import { describe, expect, it } from "vitest";

import { adsManagerUrl } from "./ads-manager-url";

describe("adsManagerUrl", () => {
  it("builds campaign and ad links and strips the act_ prefix", () => {
    expect(adsManagerUrl("campaign", "111", "act_999")).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/campaigns?act=999&selected_campaign_ids=111",
    );
    expect(adsManagerUrl("ad", "222", "999")).toBe(
      "https://adsmanager.facebook.com/adsmanager/manage/ads?act=999&selected_ad_ids=222",
    );
    expect(adsManagerUrl("ad", "222", null)).toBeNull();
  });
});
