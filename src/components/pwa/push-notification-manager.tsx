"use client";

import * as React from "react";
import {
  AlarmClock,
  AtSign,
  Bell,
  BellOff,
  BellRing,
  CalendarClock,
  CheckCircle2,
  Loader2,
  Send,
  Share,
  Smartphone,
  Sparkles,
  UserPlus,
} from "lucide-react";

import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";

export interface PushPrefsState {
  notifyNewLead: boolean;
  notifyMention: boolean;
  notifyCallback: boolean;
  notifyDailyDigest: boolean;
}

const DEFAULT_PREFS: PushPrefsState = {
  notifyNewLead: true,
  notifyMention: true,
  notifyCallback: true,
  notifyDailyDigest: true,
};

const PUSH_SYNC_EVENT = "crm:push-state-changed";

function urlBase64ToUint8Array(base64String: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  const buffer = new ArrayBuffer(rawData.length);
  const outputArray = new Uint8Array(buffer);
  for (let i = 0; i < rawData.length; ++i) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray;
}

interface PushEnvironmentState {
  ready: boolean;
  supported: boolean;
  isIosNeedInstall: boolean;
  permission: NotificationPermission | "unsupported";
  configured: boolean;
  vapidPublicKey: string;
  subscribed: boolean;
  endpoint: string | null;
  deviceCount: number;
  preferences: PushPrefsState;
}

function usePushController(enabled = true) {
  const toast = useToast();
  const [state, setState] = React.useState<PushEnvironmentState>({
    ready: false,
    supported: false,
    isIosNeedInstall: false,
    permission: "unsupported",
    configured: true,
    vapidPublicKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? "",
    subscribed: false,
    endpoint: null,
    deviceCount: 0,
    preferences: DEFAULT_PREFS,
  });
  const [busy, setBusy] = React.useState(false);
  const [testing, setTesting] = React.useState(false);

  const refresh = React.useCallback(async () => {
    await Promise.resolve();
    if (!enabled || typeof window === "undefined") return;

    const ua = window.navigator.userAgent || "";
    const isIos = /iphone|ipad|ipod/i.test(ua);
    const isStandalone =
      window.matchMedia?.("(display-mode: standalone)")?.matches ||
      (window.navigator as Navigator & { standalone?: boolean }).standalone === true;

    const supported =
      "serviceWorker" in window.navigator &&
      "PushManager" in window &&
      "Notification" in window;

    if (!supported) {
      setState((prev) => ({
        ...prev,
        ready: true,
        supported: false,
        isIosNeedInstall: isIos && !isStandalone,
        permission: "unsupported",
      }));
      return;
    }

    const permission = window.Notification.permission;
    let currentEndpoint: string | null = null;

    try {
      const reg = await window.navigator.serviceWorker.register("/sw.js", { scope: "/" });
      const existingSub = await reg.pushManager.getSubscription();
      currentEndpoint = existingSub?.endpoint ?? null;
    } catch (err) {
      console.warn("[pwa-push] SW register warning:", err);
    }

    try {
      const qs = currentEndpoint ? `?endpoint=${encodeURIComponent(currentEndpoint)}` : "";
      const res = await fetch(`/api/push/subscription${qs}`, { cache: "no-store" });
      if (res.ok) {
        const json = (await res.json()) as {
          configured?: boolean;
          vapidPublicKey?: string;
          deviceCount?: number;
          subscribed?: boolean;
          preferences?: PushPrefsState;
        };
        setState({
          ready: true,
          supported: true,
          isIosNeedInstall: false,
          permission,
          configured: Boolean(json.configured),
          vapidPublicKey: json.vapidPublicKey || process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || "",
          subscribed: Boolean(currentEndpoint && json.subscribed),
          endpoint: currentEndpoint,
          deviceCount: json.deviceCount ?? 0,
          preferences: json.preferences ?? DEFAULT_PREFS,
        });
        return;
      }
    } catch {
      // ignore transient network errors
    }

    setState((prev) => ({
      ...prev,
      ready: true,
      supported: true,
      isIosNeedInstall: false,
      permission,
      endpoint: currentEndpoint,
    }));
  }, [enabled]);

  React.useEffect(() => {
    queueMicrotask(() => {
      void refresh();
    });
    const handleSync = () => {
      void refresh();
    };
    window.addEventListener(PUSH_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(PUSH_SYNC_EVENT, handleSync);
  }, [refresh]);

  const broadcastSync = () => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent(PUSH_SYNC_EVENT));
    }
  };

  const subscribeDevice = async () => {
    if (!state.supported || busy) return;
    if (!state.vapidPublicKey) {
      toast.error("Chưa cấu hình Push", "Máy chủ chưa có khóa VAPID cho thông báo đẩy.");
      return;
    }

    setBusy(true);
    try {
      const permission = await window.Notification.requestPermission();
      if (permission !== "granted") {
        setState((prev) => ({ ...prev, permission }));
        toast.error(
          "Chưa cấp quyền thông báo",
          "Vui lòng cho phép quyền Thông báo trong cài đặt trình duyệt / điện thoại.",
        );
        return;
      }

      const reg = await window.navigator.serviceWorker.register("/sw.js", { scope: "/" });
      await window.navigator.serviceWorker.ready;

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlBase64ToUint8Array(state.vapidPublicKey),
        });
      }

      const jsonSub = sub.toJSON();
      if (!jsonSub.endpoint || !jsonSub.keys?.p256dh || !jsonSub.keys?.auth) {
        throw new Error("Trình duyệt không trả về khóa mã hóa hợp lệ.");
      }

      const res = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: jsonSub.endpoint,
          keys: {
            p256dh: jsonSub.keys.p256dh,
            auth: jsonSub.keys.auth,
          },
          userAgent: window.navigator.userAgent,
          preferences: state.preferences,
        }),
      });

      const data = (await res.json().catch(() => ({}))) as {
        ok?: boolean;
        error?: string;
        preferences?: PushPrefsState;
      };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không lưu được đăng ký thông báo.");
      }

      setState((prev) => ({
        ...prev,
        permission: "granted",
        subscribed: true,
        endpoint: jsonSub.endpoint!,
        deviceCount: Math.max(1, prev.deviceCount + (prev.subscribed ? 0 : 1)),
        preferences: data.preferences ?? prev.preferences,
      }));
      broadcastSync();
      toast.success("Đã bật thông báo đẩy", "Thiết bị sẽ nhận thông báo ngay cả khi đóng trình duyệt.");
    } catch (err) {
      toast.error(
        "Bật thông báo thất bại",
        err instanceof Error ? err.message : "Vui lòng thử lại sau.",
      );
    } finally {
      setBusy(false);
    }
  };

  const unsubscribeDevice = async () => {
    if (!state.supported || busy) return;
    setBusy(true);
    try {
      const reg = await window.navigator.serviceWorker.getRegistration();
      const sub = await reg?.pushManager.getSubscription();
      const endpoint = sub?.endpoint ?? state.endpoint;

      if (endpoint) {
        await fetch("/api/push/subscription", {
          method: "DELETE",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ endpoint }),
        }).catch(() => undefined);
      }
      if (sub) {
        await sub.unsubscribe().catch(() => undefined);
      }

      setState((prev) => ({
        ...prev,
        subscribed: false,
        endpoint: null,
        deviceCount: Math.max(0, prev.deviceCount - 1),
      }));
      broadcastSync();
      toast.success("Đã tắt thông báo trên thiết bị này");
    } catch (err) {
      toast.error(
        "Không thể tắt thông báo",
        err instanceof Error ? err.message : "Vui lòng thử lại.",
      );
    } finally {
      setBusy(false);
    }
  };

  const updatePreference = async (key: keyof PushPrefsState, value: boolean) => {
    const prevPrefs = state.preferences;
    const nextPrefs = { ...prevPrefs, [key]: value };
    setState((prev) => ({ ...prev, preferences: nextPrefs }));

    if (!state.subscribed) return;

    try {
      const res = await fetch("/api/push/subscription", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          endpoint: state.endpoint,
          [key]: value,
        }),
      });
      if (!res.ok) throw new Error("Cập nhật tùy chọn thất bại");
      broadcastSync();
    } catch {
      setState((prev) => ({ ...prev, preferences: prevPrefs }));
      toast.error("Không lưu được tùy chọn thông báo");
    }
  };

  const sendTestPush = async () => {
    if (!state.subscribed || testing) return;
    setTesting(true);
    try {
      const res = await fetch("/api/push/subscription", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: "test",
          endpoint: state.endpoint,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        throw new Error(data.error || "Không gửi được thông báo thử.");
      }
      toast.success("Đã bắn thông báo thử!", "Hãy kiểm tra thanh thông báo của điện thoại / máy tính.");
    } catch (err) {
      toast.error(
        "Gửi thử thất bại",
        err instanceof Error ? err.message : "Vui lòng bật lại thông báo trên thiết bị.",
      );
    } finally {
      setTesting(false);
    }
  };

  return {
    state,
    busy,
    testing,
    subscribeDevice,
    unsubscribeDevice,
    updatePreference,
    sendTestPush,
  };
}

const CHANNEL_ITEMS: {
  key: keyof PushPrefsState;
  title: string;
  description: string;
  icon: typeof UserPlus;
  accent: string;
}[] = [
  {
    key: "notifyNewLead",
    title: "Lead mới & Giao việc",
    description: "Báo tức thì khi có khách mới từ Facebook hoặc bạn vừa được giao phụ trách lead.",
    icon: UserPlus,
    accent: "bg-blue-50 text-blue-600",
  },
  {
    key: "notifyMention",
    title: "Nhắc tên @mention & Bình luận",
    description: "Khi đồng nghiệp @tag tên bạn hoặc trao đổi trong lead bạn đang phụ trách.",
    icon: AtSign,
    accent: "bg-violet-50 text-violet-600",
  },
  {
    key: "notifyCallback",
    title: "Nhắc lịch hẹn gọi lại",
    description: "Tự động nhắc trước giờ hẹn gọi lại khách hàng 15 phút để không lỡ cuộc gọi.",
    icon: CalendarClock,
    accent: "bg-amber-50 text-amber-600",
  },
  {
    key: "notifyDailyDigest",
    title: "Báo thức kiểm tra hàng ngày",
    description: "Đều đặn 08:30 sáng & 14:00 chiều nhắc vào CRM kiểm tra lead chưa gọi & quá hạn.",
    icon: AlarmClock,
    accent: "bg-emerald-50 text-emerald-600",
  },
];

export function PushNotificationPanel() {
  const {
    state,
    busy,
    testing,
    subscribeDevice,
    unsubscribeDevice,
    updatePreference,
    sendTestPush,
  } = usePushController(true);

  if (!state.ready) {
    return (
      <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin text-primary" />
        Đang kiểm tra trạng thái thông báo trên thiết bị...
      </div>
    );
  }

  if (state.isIosNeedInstall) {
    return (
      <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-xs text-amber-950">
        <div className="flex items-start gap-2.5">
          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-amber-100 text-amber-700">
            <Smartphone className="size-4" />
          </span>
          <div className="space-y-1">
            <p className="text-[13px] font-semibold text-amber-950">
              Cài đặt ra Màn hình chính để nhận thông báo trên iPhone / iPad
            </p>
            <p className="leading-relaxed text-amber-800">
              Apple yêu cầu mở web dưới dạng Ứng dụng (PWA) để bật Push Notification như App gốc:
            </p>
          </div>
        </div>
        <ol className="space-y-1.5 rounded-lg bg-white/85 p-3 text-[12px] font-medium text-slate-700 ring-1 ring-amber-200/70">
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              1
            </span>
            <span>
              Bấm nút <strong>Chia sẻ</strong> <Share className="inline size-3.5 text-primary" /> ở thanh dưới trình duyệt Safari
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              2
            </span>
            <span>
              Chọn <strong>«Thêm vào MH chính»</strong> (Add to Home Screen)
            </span>
          </li>
          <li className="flex items-center gap-2">
            <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[11px] font-bold text-primary">
              3
            </span>
            <span>
              Mở biểu tượng <strong>SEMTOP CRM</strong> ngoài màn hình chính và bật chuông thông báo
            </span>
          </li>
        </ol>
      </div>
    );
  }

  if (!state.supported) {
    return (
      <div className="flex items-start gap-2.5 rounded-xl border border-border bg-slate-50 p-3.5 text-xs text-muted-foreground">
        <BellOff className="mt-0.5 size-4 shrink-0 text-slate-400" />
        <div>
          <p className="font-semibold text-slate-700">Trình duyệt hiện tại không hỗ trợ Web Push</p>
          <p className="mt-0.5">
            Hãy sử dụng Chrome, Edge, Safari (macOS / iOS cài ra màn hình chính) để nhận thông báo đẩy.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3.5">
      {/* Công tắc tổng cho thiết bị hiện tại */}
      <div
        className={cn(
          "flex items-center justify-between gap-3 rounded-xl border p-3.5 transition-colors",
          state.subscribed
            ? "border-emerald-200 bg-emerald-50/45"
            : "border-border bg-slate-50/70",
        )}
      >
        <div className="flex min-w-0 items-start gap-3">
          <span
            className={cn(
              "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
              state.subscribed
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-200/80 text-slate-600",
            )}
          >
            {state.subscribed ? <BellRing className="size-4.5" /> : <Bell className="size-4.5" />}
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[13.5px] font-semibold text-slate-900">
                Thông báo trên thiết bị này
              </span>
              {state.subscribed ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 px-2 py-0.5 text-[10.5px] font-semibold text-emerald-700">
                  <CheckCircle2 className="size-3" />
                  Đang bật
                </span>
              ) : (
                <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[10.5px] font-medium text-slate-600">
                  Đang tắt
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11.5px] leading-snug text-muted-foreground">
              {state.subscribed
                ? `Đã kết nối (${state.deviceCount} thiết bị nhận tin cho tài khoản của bạn).`
                : "Bật để nhận tin báo ngay trên màn hình khóa điện thoại & máy tính."}
            </p>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {busy && <Loader2 className="size-4 animate-spin text-primary" />}
          <Switch
            checked={state.subscribed}
            disabled={busy || !state.configured}
            onCheckedChange={(checked) => {
              if (checked) void subscribeDevice();
              else void unsubscribeDevice();
            }}
            aria-label="Bật nhận thông báo đẩy trên thiết bị này"
          />
        </div>
      </div>

      {state.permission === "denied" && (
        <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-[11.5px] text-rose-700">
          Quyền thông báo đang bị chặn trên trình duyệt. Hãy bấm biểu tượng ổ khóa thanh địa chỉ (hoặc Cài đặt điện thoại) → cho phép <strong>Thông báo</strong> rồi bật lại.
        </div>
      )}

      {/* 4 kênh tùy chọn chi tiết */}
      <div
        className={cn(
          "divide-y divide-border/70 rounded-xl border border-border bg-white",
          !state.subscribed && "opacity-65",
        )}
      >
        {CHANNEL_ITEMS.map((item) => {
          const Icon = item.icon;
          const checked = state.preferences[item.key];
          return (
            <div key={item.key} className="flex items-center justify-between gap-3 p-3">
              <div className="flex min-w-0 items-start gap-2.5">
                <span
                  className={cn(
                    "mt-0.5 flex size-7.5 shrink-0 items-center justify-center rounded-lg",
                    item.accent,
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-slate-800">{item.title}</p>
                  <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
                    {item.description}
                  </p>
                </div>
              </div>
              <Switch
                checked={checked}
                disabled={!state.subscribed || busy}
                onCheckedChange={(val) => void updatePreference(item.key, val)}
                aria-label={item.title}
              />
            </div>
          );
        })}
      </div>

      {/* Nút bắn thử thông báo */}
      <div className="flex flex-wrap items-center justify-between gap-2 pt-0.5">
        <span className="text-[11px] text-muted-foreground">
          {state.subscribed
            ? "Bấm gửi thử để kiểm tra chuông & hiển thị trên thiết bị."
            : "Hãy bật công tắc phía trên trước khi gửi thử."}
        </span>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!state.subscribed || testing || busy}
          onClick={() => void sendTestPush()}
          className="h-8 gap-1.5 text-xs"
        >
          {testing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Send className="size-3.5 text-primary" />
          )}
          Gửi thông báo thử
        </Button>
      </div>
    </div>
  );
}

export function PushNotificationCard() {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center gap-2">
          <CardTitle className="text-base">Thông báo đẩy (PWA Push)</CardTitle>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary">
            <Sparkles className="size-3" />
            Thời gian thực
          </span>
        </div>
        <CardDescription>
          Nhận thông báo Lead mới, @mention, nhắc lịch hẹn gọi lại và báo thức kiểm tra hàng ngày ngay trên điện thoại & máy tính.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <PushNotificationPanel />
      </CardContent>
    </Card>
  );
}

export function PushNotificationBell({
  variant,
  collapsed = false,
}: {
  variant: "mobile-header" | "sidebar";
  collapsed?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const { state } = usePushController(true);

  const showAttentionDot =
    state.ready && !state.subscribed && (state.supported || state.isIosNeedInstall);

  return (
    <>
      {variant === "mobile-header" ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          aria-label="Cài đặt thông báo đẩy"
          title="Thông báo đẩy"
          className={cn(
            "relative flex size-8.5 items-center justify-center rounded-full border transition-transform active:scale-92",
            state.subscribed
              ? "border-emerald-200 bg-emerald-50/80 text-emerald-700"
              : "border-border/90 bg-slate-50/90 text-slate-700",
          )}
        >
          {state.subscribed ? <BellRing className="size-4" /> : <Bell className="size-4" />}
          {showAttentionDot && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-amber-500 ring-2 ring-white" />
          )}
          {state.subscribed && (
            <span className="absolute top-1 right-1 size-2 rounded-full bg-emerald-500 ring-2 ring-white" />
          )}
        </button>
      ) : (
        <button
          type="button"
          onClick={() => setOpen(true)}
          title={collapsed ? "Thông báo đẩy (Push)" : undefined}
          className={cn(
            "flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-xs font-medium text-white/80 transition-colors hover:bg-white/10 hover:text-white",
            collapsed && "justify-center px-0",
          )}
        >
          <span className="relative flex shrink-0 items-center justify-center">
            {state.subscribed ? (
              <BellRing className="size-4 text-emerald-300" />
            ) : (
              <Bell className="size-4" />
            )}
            {showAttentionDot && (
              <span className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-amber-400" />
            )}
          </span>
          {!collapsed && (
            <>
              <span className="flex-1 truncate text-left">Thông báo đẩy</span>
              <span
                className={cn(
                  "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                  state.subscribed
                    ? "bg-emerald-400/20 text-emerald-200"
                    : "bg-white/10 text-white/70",
                )}
              >
                {state.subscribed ? "Bật" : "Tắt"}
              </span>
            </>
          )}
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Thông báo đẩy (Web Push)</DialogTitle>
            <DialogDescription>
              Nhận cảnh báo Lead mới, nhắc lịch hẹn gọi lại và điểm danh hàng ngày ngay cả khi đóng ứng dụng.
            </DialogDescription>
          </DialogHeader>
          <PushNotificationPanel />
        </DialogContent>
      </Dialog>
    </>
  );
}
