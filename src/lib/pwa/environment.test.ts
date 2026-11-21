import { describe, expect, it, vi } from "vitest";

import {
  detectPwaBrowserEnv,
  isAtLeastIosVersion,
  parseIosVersion,
  subscribeMediaQuery,
} from "./environment";

describe("PWA iOS & Browser Environment Detection", () => {
  it("parses iPhone iOS versions across legacy and modern WebKit strings", () => {
    expect(
      parseIosVersion(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 12_5_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/12.1.2 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ major: 12, minor: 5 });

    expect(
      parseIosVersion(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/122.0.6261.89 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ major: 15, minor: 8 });

    expect(
      parseIosVersion(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_3 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.3 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ major: 18, minor: 3 });

    expect(
      parseIosVersion(
        "Mozilla/5.0 (iPhone; CPU iPhone OS 26_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/26.0 Mobile/15E148 Safari/604.1",
      ),
    ).toEqual({ major: 26, minor: 0 });
  });

  it("compares iOS version thresholds accurately", () => {
    expect(isAtLeastIosVersion({ major: 15, minor: 8 }, 16, 4)).toBe(false);
    expect(isAtLeastIosVersion({ major: 16, minor: 3 }, 16, 4)).toBe(false);
    expect(isAtLeastIosVersion({ major: 16, minor: 4 }, 16, 4)).toBe(true);
    expect(isAtLeastIosVersion({ major: 17, minor: 0 }, 16, 4)).toBe(true);
    expect(isAtLeastIosVersion(null, 16, 4)).toBe(false);
  });

  it("allows Safari installation on all iOS versions including legacy iOS 12–15", () => {
    const env = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 15_8 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.6 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(env.platform).toBe("ios");
    expect(env.iosBrowser).toBe("safari");
    expect(env.canInstallInCurrentIosBrowser).toBe(true);
    expect(env.supportsIosWebPushVersion).toBe(false);
  });

  it("blocks direct install in Chrome on iOS < 16.4 (requires switching to Safari)", () => {
    const env = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 16_2 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/114.0.5735.124 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(env.platform).toBe("ios");
    expect(env.iosBrowser).toBe("chrome");
    expect(env.canInstallInCurrentIosBrowser).toBe(false);
  });

  it("allows direct install in Chrome / Edge / Firefox on iOS 16.4+", () => {
    const chrome17 = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/126.0.6478.153 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(chrome17.iosBrowser).toBe("chrome");
    expect(chrome17.canInstallInCurrentIosBrowser).toBe(true);
    expect(chrome17.supportsIosWebPushVersion).toBe(true);
  });

  it("detects iPadOS 13+ desktop-class user agent as iOS + iPad", () => {
    const ipad = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15",
      platform: "MacIntel",
      maxTouchPoints: 5,
    });
    expect(ipad.platform).toBe("ios");
    expect(ipad.isIos).toBe(true);
    expect(ipad.isIpad).toBe(true);
    expect(ipad.iosBrowser).toBe("safari");
    expect(ipad.canInstallInCurrentIosBrowser).toBe(true);
    expect(ipad.supportsIosWebPushVersion).toBe(true);
  });

  it("detects Zalo, Facebook/Messenger, TikTok, and Google App in-app webviews", () => {
    const zalo = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 17_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 Zalo iOS/240501",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(zalo.isInAppBrowser).toBe(true);
    expect(zalo.inAppName).toBe("Zalo");
    expect(zalo.canInstallInCurrentIosBrowser).toBe(false);

    const gsa = detectPwaBrowserEnv({
      userAgent:
        "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/340.0.688573222 Mobile/15E148 Safari/604.1",
      platform: "iPhone",
      maxTouchPoints: 5,
    });
    expect(gsa.isInAppBrowser).toBe(true);
    expect(gsa.inAppName).toBe("Google App");
    expect(gsa.canInstallInCurrentIosBrowser).toBe(false);
  });

  it("falls back to addListener/removeListener for legacy iOS 12–13 MediaQueryList", () => {
    const addListener = vi.fn();
    const removeListener = vi.fn();
    const legacyMql = {
      matches: false,
      media: "(display-mode: standalone)",
      onchange: null,
      addListener,
      removeListener,
      dispatchEvent: () => false,
    } as unknown as MediaQueryList;

    const handler = vi.fn();
    const unsubscribe = subscribeMediaQuery(legacyMql, handler);
    expect(addListener).toHaveBeenCalledWith(handler);
    unsubscribe();
    expect(removeListener).toHaveBeenCalledWith(handler);
  });
});
