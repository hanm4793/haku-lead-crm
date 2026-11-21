export type PlatformKind = "ios" | "android" | "desktop";
export type IosBrowserKind = "safari" | "chrome" | "edge" | "firefox" | "other";

export interface IosVersion {
  major: number;
  minor: number;
}

export interface DetectedPwaBrowserEnv {
  platform: PlatformKind;
  isIos: boolean;
  isIpad: boolean;
  iosVersion: { major: number; minor: number } | null;
  iosBrowser: IosBrowserKind;
  isInAppBrowser: boolean;
  inAppName: string | null;
  /**
   * Trên iOS < 16.4, Apple chỉ cho phép "Thêm vào MH chính" từ trình duyệt Safari gốc.
   * Từ iOS 16.4+, Chrome / Edge / Firefox trên iOS cũng hỗ trợ nút "Thêm vào MH chính" trong menu Chia sẻ.
   * Các WebView nhúng (Zalo, Messenger, Facebook, TikTok, Google App...) không hỗ trợ cài PWA trực tiếp.
   */
  canInstallInCurrentIosBrowser: boolean;
  /** Web Push trên iPhone/iPad yêu cầu từ iOS/iPadOS 16.4+ và mở ở chế độ Standalone. */
  supportsIosWebPushVersion: boolean;
}

const IN_APP_PATTERNS: ReadonlyArray<{ pattern: RegExp; label: string }> = [
  { pattern: /Zalo/i, label: "Zalo" },
  { pattern: /FB_IAB|FBAN|FBAV|Messenger/i, label: "Facebook / Messenger" },
  { pattern: /Instagram/i, label: "Instagram" },
  { pattern: /Barcelona/i, label: "Threads" },
  { pattern: /TikTok|BytedanceWebview|musical_ly/i, label: "TikTok" },
  { pattern: /\bLine\//i, label: "LINE" },
  { pattern: /Telegram/i, label: "Telegram" },
  { pattern: /Viber/i, label: "Viber" },
  { pattern: /MicroMessenger/i, label: "WeChat" },
  { pattern: /\bGSA\//i, label: "Google App" },
];

export function parseIosVersion(ua: string): { major: number; minor: number } | null {
  // Ví dụ: "CPU iPhone OS 16_4 like Mac OS X" hoặc "CPU OS 15_8_3 like Mac OS X"
  const osMatch = ua.match(/(?:iPhone\s+OS|CPU\s+OS)\s+(\d+)[._](\d+)/i);
  if (osMatch) {
    return {
      major: Number.parseInt(osMatch[1], 10),
      minor: Number.parseInt(osMatch[2], 10),
    };
  }
  // Trên iPadOS 13+ (Desktop UA: "Macintosh; Intel Mac OS X 10_15_7 ... Version/17.4 ... Safari/605.1.15"),
  // phiên bản Safari `Version/X.Y` tương ứng trực tiếp với phiên bản iPadOS X.Y.
  const versionMatch = ua.match(/Version\/(\d+)\.(\d+)/i);
  if (versionMatch) {
    return {
      major: Number.parseInt(versionMatch[1], 10),
      minor: Number.parseInt(versionMatch[2], 10),
    };
  }
  return null;
}

export function isAtLeastIosVersion(
  version: { major: number; minor: number } | null,
  minMajor: number,
  minMinor = 0,
): boolean {
  if (!version) return false;
  if (version.major !== minMajor) return version.major > minMajor;
  return version.minor >= minMinor;
}

export function detectPwaBrowserEnv(input: {
  userAgent: string;
  platform?: string;
  maxTouchPoints?: number;
}): DetectedPwaBrowserEnv {
  const ua = input.userAgent || "";
  const navPlatform = input.platform || "";
  const touchPoints = input.maxTouchPoints ?? 0;

  const isIpadDesktopMode = navPlatform === "MacIntel" && touchPoints > 1;
  const isIpadUa = /ipad/i.test(ua);
  const isIpad = isIpadUa || isIpadDesktopMode;
  const isIos = isIpad || /iphone|ipod/i.test(ua);
  const isAndroid = !isIos && /android/i.test(ua);
  const platform: PlatformKind = isIos ? "ios" : isAndroid ? "android" : "desktop";

  let inAppName: string | null = null;
  for (const item of IN_APP_PATTERNS) {
    if (item.pattern.test(ua)) {
      inAppName = item.label;
      break;
    }
  }
  const isInAppBrowser = Boolean(inAppName);

  let iosBrowser: IosBrowserKind = "safari";
  if (isIos) {
    if (isInAppBrowser) {
      iosBrowser = "other";
    } else if (/CriOS/i.test(ua)) {
      iosBrowser = "chrome";
    } else if (/EdgiOS/i.test(ua)) {
      iosBrowser = "edge";
    } else if (/FxiOS/i.test(ua)) {
      iosBrowser = "firefox";
    } else if (/OPiOS|Brave|CocCoc/i.test(ua)) {
      iosBrowser = "other";
    } else if (/Safari/i.test(ua)) {
      iosBrowser = "safari";
    } else {
      // WKWebView nhúng của ứng dụng thứ ba không có token Safari
      iosBrowser = "other";
    }
  }

  const iosVersion = isIos ? parseIosVersion(ua) : null;
  // Khi không đọc được version trên Safari/Chrome đời mới (ví dụ UA bị rút gọn), ưu tiên giả định >= 16.4 cho Chrome/Edge/Firefox;
  // ngược lại nếu đọc rõ version < 16.4 thì bắt buộc hướng dẫn mở Safari.
  const isIos164Plus = iosVersion ? isAtLeastIosVersion(iosVersion, 16, 4) : true;

  const canInstallInCurrentIosBrowser =
    isIos &&
    !isInAppBrowser &&
    (iosBrowser === "safari" ||
      ((iosBrowser === "chrome" || iosBrowser === "edge" || iosBrowser === "firefox") && isIos164Plus));

  const supportsIosWebPushVersion = isIos && isIos164Plus;

  return {
    platform,
    isIos,
    isIpad,
    iosVersion,
    iosBrowser,
    isInAppBrowser,
    inAppName,
    canInstallInCurrentIosBrowser,
    supportsIosWebPushVersion,
  };
}

/**
 * Kiểm tra thiết bị đang chạy bên trong khung ứng dụng độc lập (PWA đã cài ra Màn hình chính)
 * tương thích từ iOS 9 (`navigator.standalone`) tới các chuẩn W3C `display-mode` mới.
 */
export function isRunningStandalone(win: Window = window): boolean {
  if ((win.navigator as Navigator & { standalone?: boolean }).standalone === true) {
    return true;
  }
  try {
    return Boolean(
      win.matchMedia?.("(display-mode: standalone)")?.matches ||
        win.matchMedia?.("(display-mode: fullscreen)")?.matches ||
        win.matchMedia?.("(display-mode: minimal-ui)")?.matches,
    );
  } catch {
    return false;
  }
}

/**
 * Kiểm tra trình duyệt có hỗ trợ Web Push hay không.
 * Lưu ý: Trên iOS 16.4 – 16.6 Standalone PWA, `window.PushManager` có thể không tồn tại trên `window`
 * mà chỉ gắn trên `ServiceWorkerRegistration.prototype.pushManager`.
 */
export function isWebPushSupportedInWindow(win: Window = window): boolean {
  const hasSw = "serviceWorker" in win.navigator;
  const hasNotification = "Notification" in win;
  const swRegCtor = (
    win as Window & { ServiceWorkerRegistration?: { prototype?: object } }
  ).ServiceWorkerRegistration;
  const hasPushManager =
    "PushManager" in win ||
    Boolean(swRegCtor?.prototype && "pushManager" in swRegCtor.prototype);
  return hasSw && hasNotification && hasPushManager;
}

/**
 * Lắng nghe `MediaQueryList` an toàn cho cả Safari 14+ (`addEventListener`) lẫn iOS 12–13 (`addListener`).
 */
export function subscribeMediaQuery(
  mql: MediaQueryList | undefined | null,
  listener: (event: MediaQueryListEvent) => void,
): () => void {
  if (!mql) return () => {};
  if (typeof mql.addEventListener === "function") {
    mql.addEventListener("change", listener);
    return () => mql.removeEventListener("change", listener);
  }
  // Fallback cho iOS Safari <= 13.7
  if (typeof mql.addListener === "function") {
    mql.addListener(listener);
    return () => mql.removeListener(listener);
  }
  return () => {};
}

/**
 * Sao chép văn bản vào clipboard có fallback `execCommand('copy')` cho iOS < 13.4 và các WebView nhúng (Zalo/Messenger).
 */
export async function copyTextSafely(text: string): Promise<boolean> {
  if (typeof window === "undefined") return false;
  try {
    if (window.navigator.clipboard?.writeText) {
      await window.navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Fallback xuống textarea bên dưới khi WebView chặn Clipboard API
  }

  try {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.top = "-9999px";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, text.length);
    const ok = document.execCommand("copy");
    document.body.removeChild(textarea);
    return ok;
  } catch {
    return false;
  }
}
