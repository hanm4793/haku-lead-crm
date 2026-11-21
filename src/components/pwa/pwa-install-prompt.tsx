"use client";

import * as React from "react";
import Image from "next/image";
import {
  Check,
  Copy,
  Download,
  ExternalLink,
  MoreHorizontal,
  MoreVertical,
  PlusSquare,
  Share,
  Smartphone,
  X,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  copyTextSafely,
  detectPwaBrowserEnv,
  isRunningStandalone,
  subscribeMediaQuery,
  type DetectedPwaBrowserEnv,
} from "@/lib/pwa/environment";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_STORAGE_KEY = "semtop_pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 ngày
const OPEN_GUIDE_EVENT = "crm:pwa-open-install-guide";

let globalDeferredPrompt: BeforeInstallPromptEvent | null = null;
const promptListeners = new Set<() => void>();

if (typeof window !== "undefined") {
  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();
    globalDeferredPrompt = event as BeforeInstallPromptEvent;
    for (const listener of promptListeners) listener();
  });

  window.addEventListener("appinstalled", () => {
    globalDeferredPrompt = null;
    for (const listener of promptListeners) listener();
  });
}

export function openPwaInstallGuide() {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(OPEN_GUIDE_EVENT));
  }
}

export interface PwaInstallState extends DetectedPwaBrowserEnv {
  ready: boolean;
  isStandalone: boolean;
  hasNativePrompt: boolean;
  dismissedRecently: boolean;
}

const INITIAL_INSTALL_STATE: PwaInstallState = {
  ready: false,
  isStandalone: true,
  platform: "desktop",
  isIos: false,
  isIpad: false,
  iosVersion: null,
  iosBrowser: "safari",
  isInAppBrowser: false,
  inAppName: null,
  canInstallInCurrentIosBrowser: false,
  supportsIosWebPushVersion: false,
  hasNativePrompt: false,
  dismissedRecently: false,
};

function detectInstallState(): PwaInstallState {
  if (typeof window === "undefined") {
    return INITIAL_INSTALL_STATE;
  }

  const env = detectPwaBrowserEnv({
    userAgent: window.navigator.userAgent || "",
    platform: window.navigator.platform || "",
    maxTouchPoints: window.navigator.maxTouchPoints ?? 0,
  });

  const isStandalone = isRunningStandalone(window);

  let dismissedRecently = false;
  try {
    const raw = window.localStorage.getItem(DISMISS_STORAGE_KEY);
    if (raw) {
      const ts = Number(raw);
      if (Number.isFinite(ts) && Date.now() - ts < DISMISS_COOLDOWN_MS) {
        dismissedRecently = true;
      }
    }
  } catch {
    // ignore storage errors (e.g. Safari Private Browsing on older iOS)
  }

  return {
    ...env,
    ready: true,
    isStandalone,
    hasNativePrompt: Boolean(globalDeferredPrompt),
    dismissedRecently,
  };
}

export function usePwaInstall() {
  const [state, setState] = React.useState<PwaInstallState>(INITIAL_INSTALL_STATE);

  React.useEffect(() => {
    const sync = () => {
      setState(detectInstallState());
    };
    sync();

    // Đăng ký Service Worker sớm với `updateViaCache: "none"` để không bị WebKit cache bản cũ
    if ("serviceWorker" in window.navigator) {
      window.navigator.serviceWorker
        .register("/sw.js", { scope: "/", updateViaCache: "none" })
        .catch(() => undefined);
    }

    promptListeners.add(sync);
    const mql = window.matchMedia?.("(display-mode: standalone)");
    const unsubscribeMql = subscribeMediaQuery(mql, sync);
    window.addEventListener("pageshow", sync);

    return () => {
      promptListeners.delete(sync);
      unsubscribeMql();
      window.removeEventListener("pageshow", sync);
    };
  }, []);

  const triggerInstall = async () => {
    if (globalDeferredPrompt) {
      try {
        await globalDeferredPrompt.prompt();
        const choice = await globalDeferredPrompt.userChoice;
        if (choice.outcome === "accepted") {
          globalDeferredPrompt = null;
          setState(detectInstallState());
        }
        return;
      } catch {
        // fallback sang hộp thoại hướng dẫn nếu trình duyệt chặn
      }
    }
    openPwaInstallGuide();
  };

  const dismissBanner = () => {
    try {
      window.localStorage.setItem(DISMISS_STORAGE_KEY, String(Date.now()));
    } catch {
      // ignore
    }
    setState((prev) => ({ ...prev, dismissedRecently: true }));
  };

  return {
    state,
    triggerInstall,
    dismissBanner,
  };
}

function CopySiteUrlButton({ label = "Sao chép link để dán vào Safari" }: { label?: string }) {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    if (typeof window === "undefined") return;
    const cleanUrl = `${window.location.origin}/`;
    const ok = await copyTextSafely(cleanUrl);
    if (ok) {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    }
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={() => void handleCopy()}
      className="h-9 w-full gap-1.5 border-primary/25 bg-white text-xs font-semibold text-primary hover:bg-primary/5"
    >
      {copied ? (
        <>
          <Check className="size-3.5 text-emerald-600" />
          <span className="text-emerald-700">Đã sao chép link — Mở Safari và dán vào thanh địa chỉ</span>
        </>
      ) : (
        <>
          <Copy className="size-3.5" />
          <span>{label}</span>
        </>
      )}
    </Button>
  );
}

function PwaInstallGuideDialog({
  open,
  onOpenChange,
  state,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  state: PwaInstallState;
}) {
  const browserLabel =
    state.iosBrowser === "chrome"
      ? "Chrome"
      : state.iosBrowser === "edge"
        ? "Edge"
        : state.iosBrowser === "firefox"
          ? "Firefox"
          : "trình duyệt này";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white shadow-xs">
              <Image
                src="/apple-touch-icon.png"
                alt="SEMTOP CRM"
                width={36}
                height={36}
                className="size-9 rounded-lg object-contain"
              />
            </div>
            <div className="text-left">
              <DialogTitle>Thêm SEMTOP CRM vào Màn hình chính</DialogTitle>
              <DialogDescription>
                Dùng mượt toàn màn hình như ứng dụng gốc và nhận thông báo đẩy tức thì.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {state.isInAppBrowser ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950">
            <p className="leading-relaxed font-semibold">
              Bạn đang mở trong <strong>{state.inAppName || "ứng dụng chat"}</strong> — cửa sổ nhúng này không cho phép cài ứng dụng ra Màn hình chính.
            </p>
            <ol className="space-y-2 rounded-lg bg-white/95 p-3 text-[12.5px] text-slate-700 ring-1 ring-amber-200/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  1
                </span>
                <span>
                  Bấm biểu tượng <strong>⋯</strong> hoặc{" "}
                  <ExternalLink className="mx-0.5 inline size-3.5 text-primary" /> ở góc trên bên phải màn hình
                </span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  2
                </span>
                <span>
                  Chọn{" "}
                  <strong>
                    {state.isIos ? "«Mở bằng Safari» (Open in Safari)" : "«Mở bằng trình duyệt Chrome»"}
                  </strong>{" "}
                  rồi thực hiện cài đặt.
                </span>
              </li>
            </ol>
            <CopySiteUrlButton
              label={
                state.isIos
                  ? "Hoặc sao chép link để dán vào Safari"
                  : "Hoặc sao chép link để dán vào Chrome"
              }
            />
          </div>
        ) : state.platform === "ios" && !state.canInstallInCurrentIosBrowser ? (
          /* Trường hợp iOS < 16.4 đang mở bằng Chrome / Edge / Firefox / Cốc Cốc / Brave */
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/80 p-3.5 text-xs text-amber-950">
            <p className="leading-relaxed font-semibold">
              Trên phiên bản iOS hiện tại, {browserLabel} chưa hỗ trợ nút «Thêm vào MH chính» (Apple giới hạn chỉ cho phép trên <strong>Safari</strong>).
            </p>
            <ol className="space-y-2 rounded-lg bg-white/95 p-3 text-[12.5px] text-slate-700 ring-1 ring-amber-200/70">
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  1
                </span>
                <span>Bấm nút sao chép đường dẫn bên dưới và mở trình duyệt <strong>Safari</strong> trên iPhone / iPad.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  2
                </span>
                <span>
                  Trong Safari, bấm <strong>Chia sẻ</strong>{" "}
                  <Share className="mx-0.5 inline size-3.5 text-primary" /> → chọn{" "}
                  <strong>«Thêm vào MH chính»</strong>.
                </span>
              </li>
            </ol>
            <CopySiteUrlButton />
          </div>
        ) : state.platform === "ios" && state.iosBrowser !== "safari" ? (
          /* Trường hợp iOS >= 16.4 đang mở bằng Chrome / Edge / Firefox */
          <div className="space-y-2.5">
            <ol className="space-y-2.5 rounded-xl border border-border bg-slate-50/80 p-3.5 text-[13px] text-slate-800">
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  1
                </span>
                <span>
                  Bấm biểu tượng <strong>Chia sẻ</strong>{" "}
                  <Share className="mx-0.5 inline size-4 text-primary" /> ở{" "}
                  <strong>góc trên bên phải thanh địa chỉ</strong> của {browserLabel} (hoặc menu{" "}
                  <MoreHorizontal className="mx-0.5 inline size-4 text-primary" />).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  2
                </span>
                <span>
                  Cuộn danh sách xuống dưới chọn <strong>«Thêm vào Màn hình chính»</strong>{" "}
                  <PlusSquare className="mx-0.5 inline size-4 text-primary" /> (<em>Add to Home Screen</em>).
                </span>
              </li>
              <li className="flex items-start gap-2.5">
                <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                  3
                </span>
                <span>
                  Bấm <strong>«Thêm»</strong> ở góc trên bên phải để hoàn tất.
                </span>
              </li>
            </ol>
            <CopySiteUrlButton label="Mẹo: Sao chép link mở bằng Safari nếu không thấy mục trên" />
          </div>
        ) : state.platform === "ios" ? (
          /* Safari trên iPhone / iPad (tương thích iOS 12 → iOS 18 / iOS 26) */
          <ol className="space-y-2.5 rounded-xl border border-border bg-slate-50/80 p-3.5 text-[13px] text-slate-800">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                1
              </span>
              <span>
                {state.isIpad ? (
                  <>
                    Bấm nút <strong>Chia sẻ</strong>{" "}
                    <Share className="mx-0.5 inline size-4 text-primary" /> ở{" "}
                    <strong>thanh địa chỉ phía trên cùng</strong> của Safari.
                  </>
                ) : (
                  <>
                    Bấm nút <strong>Chia sẻ</strong>{" "}
                    <Share className="mx-0.5 inline size-4 text-primary" /> trên thanh công cụ Safari (trên iOS mới, nếu thanh địa chỉ thu gọn hãy bấm{" "}
                    <MoreHorizontal className="mx-0.5 inline size-4 text-primary" /> trước rồi chọn <strong>Chia sẻ</strong>).
                  </>
                )}
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                2
              </span>
              <span>
                Cuộn bảng chia sẻ xuống dưới (hoặc bấm <strong>Xem thêm</strong>) và chọn{" "}
                <strong>«Thêm vào MH chính»</strong>{" "}
                <PlusSquare className="mx-0.5 inline size-4 text-primary" /> (<em>Add to Home Screen</em>).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                3
              </span>
              <span>
                Giữ bật tùy chọn <strong>«Mở dưới dạng ứng dụng web»</strong> (nếu có) rồi bấm{" "}
                <strong>«Thêm»</strong> ở góc trên bên phải.
              </span>
            </li>
          </ol>
        ) : state.platform === "android" ? (
          <ol className="space-y-2.5 rounded-xl border border-border bg-slate-50/80 p-3.5 text-[13px] text-slate-800">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                1
              </span>
              <span>
                Bấm biểu tượng menu <MoreVertical className="mx-0.5 inline size-4 text-primary" /> ở góc trên bên phải trình duyệt Chrome.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                2
              </span>
              <span>
                Chọn <strong>«Cài đặt ứng dụng»</strong> hoặc <strong>«Thêm vào Màn hình chính»</strong>.
              </span>
            </li>
          </ol>
        ) : (
          <ol className="space-y-2.5 rounded-xl border border-border bg-slate-50/80 p-3.5 text-[13px] text-slate-800">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                1
              </span>
              <span>
                Nhìn lên bên phải thanh địa chỉ trình duyệt (Chrome / Edge / Safari macOS), bấm biểu tượng{" "}
                <strong>Cài đặt ứng dụng</strong> <Download className="mx-0.5 inline size-4 text-primary" /> (hoặc Chia sẻ → Thêm vào Dock).
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                2
              </span>
              <span>
                Chọn <strong>«Cài đặt» (Install)</strong> để ghim SEMTOP CRM ra Màn hình chính / Thanh tác vụ.
              </span>
            </li>
          </ol>
        )}

        <div className="flex justify-end">
          <Button type="button" onClick={() => onOpenChange(false)} className="w-full sm:w-auto">
            Đã hiểu
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Thanh nổi thông minh nhắc người dùng cài đặt PWA ra Màn hình chính khi đang mở bằng trình duyệt web
 * (hiển thị cả ở màn hình Đăng nhập lẫn bên trong ứng dụng, đồng thời là nơi duy nhất quản lý Dialog hướng dẫn
 * để tránh xung đột hai Bottom Sheet chồng nhau trên iOS Safari).
 */
export function PwaInstallFloatingBanner({
  withBottomNav = true,
}: {
  /** `false` trên trang `/login` (không có thanh Bottom Tab Bar) để đặt sát mép dưới gọn gàng. */
  withBottomNav?: boolean;
}) {
  const { state, triggerInstall, dismissBanner } = usePwaInstall();
  const [guideOpen, setGuideOpen] = React.useState(false);

  React.useEffect(() => {
    const handleOpenGuide = () => setGuideOpen(true);
    window.addEventListener(OPEN_GUIDE_EVENT, handleOpenGuide);
    return () => window.removeEventListener(OPEN_GUIDE_EVENT, handleOpenGuide);
  }, []);

  if (!state.ready || state.isStandalone) return null;

  const shouldShowBanner =
    !state.dismissedRecently &&
    (state.platform === "ios" || state.platform === "android" || state.hasNativePrompt);

  const bannerSubtitle = state.isInAppBrowser
    ? `Đang mở trong ${state.inAppName || "ứng dụng chat"} — bấm để xem cách mở Safari & cài App`
    : state.platform === "ios" && !state.canInstallInCurrentIosBrowser
      ? "Mở bằng Safari để thêm ứng dụng vào Màn hình chính"
      : "Mở nhanh toàn màn hình & nhận thông báo Lead tức thì";

  return (
    <>
      {shouldShowBanner && (
        <div
          role="region"
          aria-label="Gợi ý cài đặt ứng dụng SEMTOP CRM"
          className={cn(
            "fixed z-35 transition-transform duration-200",
            withBottomNav
              ? "inset-x-2.5 bottom-[calc(4.15rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[380px]"
              : "inset-x-2.5 bottom-[max(0.75rem,env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[380px]",
          )}
        >
          <div className="flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-card/98 p-2.5 shadow-xl ring-1 ring-slate-900/5 backdrop-blur-md">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white shadow-2xs">
              <Image
                src="/apple-touch-icon.png"
                alt="SEMTOP CRM"
                width={32}
                height={32}
                className="size-8 rounded-lg object-contain"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold text-slate-900">
                Thêm SEMTOP CRM vào Màn hình chính
              </p>
              <p className="truncate text-[11px] text-muted-foreground">{bannerSubtitle}</p>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => void triggerInstall()}
              className="h-9 shrink-0 gap-1 rounded-xl px-3 text-xs font-semibold shadow-xs"
            >
              <Download className="size-3.5" />
              Cài đặt
            </Button>

            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Đóng gợi ý cài đặt"
              title="Để sau"
              className="flex size-8 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <PwaInstallGuideDialog open={guideOpen} onOpenChange={setGuideOpen} state={state} />
    </>
  );
}

/**
 * Nút cài đặt PWA đặt cố định trong Menu «Thêm» trên Mobile & trang Tài khoản (luôn bấm lại được bất cứ lúc nào).
 */
export function PwaInstallMenuRow({ onAfterClick }: { onAfterClick?: () => void }) {
  const { state, triggerInstall } = usePwaInstall();

  if (!state.ready || state.isStandalone) return null;

  return (
    <button
      type="button"
      onClick={() => {
        onAfterClick?.();
        // Đợi 1 nhịp ngắn để Bottom Sheet "Thêm" bắt đầu đóng mượt trước khi mở hộp hướng dẫn cài đặt
        window.setTimeout(() => {
          void triggerInstall();
        }, 60);
      }}
      className="flex w-full items-center justify-between gap-3 px-3.5 py-3 text-left text-sm font-medium text-primary transition-colors active:bg-primary/8"
    >
      <span className="flex items-center gap-3">
        <span className="flex size-8 items-center justify-center rounded-lg bg-primary/10 text-primary">
          <Smartphone className="size-4" />
        </span>
        <span>
          <span className="block font-semibold">Thêm ứng dụng vào Màn hình chính</span>
          <span className="block text-[11px] font-normal text-muted-foreground">
            Cài đặt PWA để dùng mượt & nhận thông báo đẩy
          </span>
        </span>
      </span>
      <Download className="size-4 shrink-0 text-primary" />
    </button>
  );
}
