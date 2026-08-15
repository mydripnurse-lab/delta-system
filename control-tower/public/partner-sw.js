/* My Drip Nurse Partner Portal service worker.
 * Patient, appointment, API, and authenticated HTML responses are intentionally
 * never cached on the device.
 */
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const title = payload.title || "My Drip Nurse Partner Portal";
  const message = payload.message || "You have a new Partner Portal notification.";
  const url = payload.url || "/partner-portal";
  const badgeCount = Number(payload.badgeCount || 0);
  event.waitUntil((async () => {
    if ("setAppBadge" in self.navigator) {
      try {
        if (badgeCount > 0) await self.navigator.setAppBadge(badgeCount);
        else await self.navigator.clearAppBadge();
      } catch { /* App badges are progressive enhancement. */ }
    }
    await self.registration.showNotification(title, {
      body: message,
      icon: "/partner-portal-icon-v2-192.png",
      badge: "/partner-portal-icon-v2-192.png",
      tag: payload.tag || payload.notificationId || "mdn-partner-notification",
      renotify: true,
      data: { url, notificationId: payload.notificationId || "" },
    });
  })());
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const data = event.notification.data || {};
  const targetUrl = new URL(data.url || "/partner-portal", self.location.origin).href;
  event.waitUntil((async () => {
    if (data.notificationId) {
      try {
        const response = await fetch("/api/partner-portal/notifications", {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ notificationId: data.notificationId }),
        });
        const result = await response.json();
        if (response.ok && "setAppBadge" in self.navigator) {
          if (Number(result.unreadCount || 0) > 0) await self.navigator.setAppBadge(Number(result.unreadCount));
          else await self.navigator.clearAppBadge();
        }
      } catch { /* Navigation still proceeds if acknowledgement fails. */ }
    }
    const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      await existing.focus();
      return;
    }
    await self.clients.openWindow(targetUrl);
  })());
});
