/* SEMTOP Marketing CRM — PWA & Web Push Service Worker */

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Sự kiện fetch giúp Chrome / Edge kích hoạt điều kiện cài đặt PWA (beforeinstallprompt)
// mà không lưu cache cứng làm cũ dữ liệu CRM thời gian thực.
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  const url = new URL(event.request.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith("/api/")) return;
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  let payload = {
    title: "SEMTOP Marketing CRM",
    body: "Bạn có thông báo mới cần kiểm tra.",
    url: "/leads",
    tag: "semtop-crm-general",
  };

  try {
    const parsed = event.data.json();
    payload = { ...payload, ...parsed };
  } catch {
    payload.body = event.data.text() || payload.body;
  }

  const options = {
    body: payload.body,
    icon: "/icons/icon-192.png",
    badge: "/icons/icon-192.png",
    tag: payload.tag || "semtop-crm-general",
    renotify: true,
    requireInteraction: Boolean(payload.requireInteraction),
    vibrate: [160, 80, 160],
    data: {
      url: payload.url || "/leads",
    },
  };

  event.waitUntil(self.registration.showNotification(payload.title, options));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const targetPath = (event.notification.data && event.notification.data.url) || "/leads";
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      for (const client of windowClients) {
        if (client.url.startsWith(self.location.origin) && "focus" in client) {
          return client.navigate(targetUrl).then((navigated) => (navigated ? navigated.focus() : client.focus()));
        }
      }
      if (self.clients.openWindow) {
        return self.clients.openWindow(targetUrl);
      }
      return undefined;
    }),
  );
});
