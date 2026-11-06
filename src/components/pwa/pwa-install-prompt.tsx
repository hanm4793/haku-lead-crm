"use client";

import * as React from "react";
import Image from "next/image";
import { Download, ExternalLink, MoreVertical, PlusSquare, Share, Smartphone, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

const DISMISS_STORAGE_KEY = "semtop_pwa_install_dismissed_at";
const DISMISS_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 ngày

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

type PlatformKind = "ios" | "android" | "desktop";

interface PwaInstallState {
  ready: boolean;
  isStandalone: boolean;
  platform: PlatformKind;
  isInAppBrowser: boolean;
  hasNativePrompt: boolean;
  dismissedRecently: boolean;
}

function detectInstallState(): PwaInstallState {
  if (typeof window === "undefined") {
    return {
      ready: false,
      isStandalone: true,
      platform: "desktop",
      isInAppBrowser: false,
      hasNativePrompt: false,
      dismissedRecently: false,
    };
  }

  const ua = window.navigator.userAgent || "";
  const isIos =
    /iphone|ipad|ipod/i.test(ua) ||
    (window.navigator.platform === "MacIntel" && window.navigator.maxTouchPoints > 1);
  const isAndroid = /android/i.test(ua);
  const platform: PlatformKind = isIos ? "ios" : isAndroid ? "android" : "desktop";

  const isInAppBrowser = /FBAN|FBAV|Zalo|Instagram|Line|TikTok/i.test(ua);

  const isStandalone =
    window.matchMedia?.("(display-mode: standalone)")?.matches ||
    window.matchMedia?.("(display-mode: fullscreen)")?.matches ||
    (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

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
    // ignore storage errors
  }

  return {
    ready: true,
    isStandalone,
    platform,
    isInAppBrowser,
    hasNativePrompt: Boolean(globalDeferredPrompt),
    dismissedRecently,
  };
}

export function usePwaInstall() {
  const [state, setState] = React.useState<PwaInstallState>({
    ready: false,
    isStandalone: true,
    platform: "desktop",
    isInAppBrowser: false,
    hasNativePrompt: false,
    dismissedRecently: false,
  });
  const [guideOpen, setGuideOpen] = React.useState(false);

  React.useEffect(() => {
    const sync = () => {
      setState(detectInstallState());
    };
    queueMicrotask(sync);

    // Đảm bảo Service Worker luôn được đăng ký sớm để trình duyệt bắn `beforeinstallprompt`
    if ("serviceWorker" in window.navigator) {
      window.navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    }

    promptListeners.add(sync);
    const mql = window.matchMedia?.("(display-mode: standalone)");
    mql?.addEventListener?.("change", sync);
    return () => {
      promptListeners.delete(sync);
      mql?.removeEventListener?.("change", sync);
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
    setGuideOpen(true);
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
    guideOpen,
    setGuideOpen,
    triggerInstall,
    dismissBanner,
  };
}

function PwaInstallGuideDialog({
  open,
  onOpenChange,
  platform,
  isInAppBrowser,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  platform: PlatformKind;
  isInAppBrowser: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <div className="flex items-center gap-3">
            <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-border bg-white shadow-xs">
              <Image src="/icons/icon-192.png" alt="SEMTOP CRM" width={32} height={32} className="size-8 object-contain" />
            </div>
            <div className="text-left">
              <DialogTitle>Thêm SEMTOP CRM vào Màn hình chính</DialogTitle>
              <DialogDescription>
                Dùng mượt như ứng dụng gốc, toàn màn hình và nhận thông báo đẩy tức thì.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {isInAppBrowser ? (
          <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/75 p-3.5 text-xs text-amber-950">
            <p className="font-semibold">
              Bạn đang mở link bên trong ứng dụng chat (Zalo / Messenger / Facebook).
            </p>
            <ol className="space-y-2 rounded-lg bg-white/90 p-3 text-slate-700 ring-1 ring-amber-200/70">
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  1
                </span>
                <span>
                  Bấm biểu tượng <strong>⋯</strong> hoặc <ExternalLink className="inline size-3.5 text-primary" /> ở góc trên bên phải
                </span>
              </li>
              <li className="flex items-center gap-2">
                <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
                  2
                </span>
                <span>
                  Chọn <strong>«Mở bằng trình duyệt»</strong> (Safari trên iPhone hoặc Chrome trên Android) rồi bấm Cài đặt
                </span>
              </li>
            </ol>
          </div>
        ) : platform === "ios" ? (
          <ol className="space-y-2.5 rounded-xl border border-border bg-slate-50/80 p-3.5 text-[13px] text-slate-800">
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                1
              </span>
              <span>
                Bấm nút <strong>Chia sẻ</strong> <Share className="mx-0.5 inline size-4 text-primary" /> ở thanh công cụ dưới cùng của Safari.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                2
              </span>
              <span>
                Cuộn xuống chọn <strong>«Thêm vào MH chính»</strong> <PlusSquare className="mx-0.5 inline size-4 text-primary" /> (<em>Add to Home Screen</em>).
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
        ) : platform === "android" ? (
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
                Nhìn lên bên phải thanh địa chỉ trình duyệt (Chrome / Edge), bấm biểu tượng <strong>Cài đặt ứng dụng</strong> <Download className="mx-0.5 inline size-4 text-primary" />.
              </span>
            </li>
            <li className="flex items-start gap-2.5">
              <span className="mt-0.5 flex size-5.5 shrink-0 items-center justify-center rounded-full bg-primary text-[11px] font-bold text-white">
                2
              </span>
              <span>
                Chọn <strong>«Cài đặt» (Install)</strong> để ghim SEMTOP CRM ra Desktop / Thanh tác vụ.
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
 * Thanh nổi thông minh nhắc người dùng cài đặt PWA ra Màn hình chính khi đang mở bằng trình duyệt web.
 * - Trên Android / Desktop Chrome: gọi thẳng hộp thoại gốc của hệ điều hành (`beforeinstallprompt`).
 * - Trên iPhone Safari: mở hướng dẫn trực quan 2 chạm.
 */
export function PwaInstallFloatingBanner() {
  const { state, guideOpen, setGuideOpen, triggerInstall, dismissBanner } = usePwaInstall();

  if (!state.ready || state.isStandalone) return null;

  // Trên Desktop chỉ tự bật banner khi trình duyệt báo hỗ trợ cài native (`hasNativePrompt`);
  // Trên Mobile (iOS + Android) luôn chủ động gợi ý thêm ra màn hình chính nếu chưa bấm đóng.
  const shouldShowBanner =
    !state.dismissedRecently &&
    (state.platform === "ios" || state.platform === "android" || state.hasNativePrompt);

  return (
    <>
      {shouldShowBanner && (
        <div
          role="region"
          aria-label="Gợi ý cài đặt ứng dụng SEMTOP CRM"
          className={cn(
            "fixed z-35 transition-all",
            "inset-x-2.5 bottom-[calc(4.15rem+env(safe-area-inset-bottom,0px))] md:inset-x-auto md:right-5 md:bottom-5 md:w-[380px]",
          )}
        >
          <div className="flex items-center gap-2.5 rounded-2xl border border-primary/20 bg-card/98 p-2.5 shadow-xl ring-1 ring-slate-900/5 backdrop-blur-md">
            <div className="flex size-10 shrink-0 items-center justify-center rounded-xl border border-border bg-white shadow-2xs">
              <Image
                src="/icons/icon-192.png"
                alt="SEMTOP CRM"
                width={28}
                height={28}
                className="size-7 object-contain"
              />
            </div>

            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-bold text-slate-900">
                Thêm SEMTOP CRM vào Màn hình chính
              </p>
              <p className="truncate text-[11px] text-muted-foreground">
                Mở nhanh toàn màn hình & nhận thông báo Lead tức thì
              </p>
            </div>

            <Button
              type="button"
              size="sm"
              onClick={() => void triggerInstall()}
              className="h-8 shrink-0 gap-1 rounded-xl px-3 text-xs font-semibold shadow-xs"
            >
              <Download className="size-3.5" />
              Cài đặt
            </Button>

            <button
              type="button"
              onClick={dismissBanner}
              aria-label="Đóng gợi ý cài đặt"
              title="Để sau"
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-700"
            >
              <X className="size-4" />
            </button>
          </div>
        </div>
      )}

      <PwaInstallGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        platform={state.platform}
        isInAppBrowser={state.isInAppBrowser}
      />
    </>
  );
}

/**
 * Nút cài đặt PWA đặt cố định trong Menu «Thêm» trên Mobile & trang Tài khoản (luôn bấm lại được bất cứ lúc nào).
 */
export function PwaInstallMenuRow({ onAfterClick }: { onAfterClick?: () => void }) {
  const { state, guideOpen, setGuideOpen, triggerInstall } = usePwaInstall();

  if (!state.ready || state.isStandalone) return null;

  return (
    <>
      <button
        type="button"
        onClick={() => {
          onAfterClick?.();
          void triggerInstall();
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

      <PwaInstallGuideDialog
        open={guideOpen}
        onOpenChange={setGuideOpen}
        platform={state.platform}
        isInAppBrowser={state.isInAppBrowser}
      />
    </>
  );
}
