self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // ignore malformed payloads
  }
  const title = data.conversationTitle || "New message";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        if (windowClients.some((c) => c.focused && c.url.includes("/chat"))) {
          return;
        }
        return self.registration.showNotification(title, {
          body: "You have a new message",
          icon: "/icon.png",
          badge: "/icon.png",
          data,
        });
      }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.conversationId
    ? `/chat?c=${encodeURIComponent(d.conversationId)}`
    : "/chat";
  event.waitUntil(
    clients.matchAll({ type: "window" }).then((windowClients) => {
      const existing = windowClients.find((w) => w.url.includes("/chat"));
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return clients.openWindow(url);
    }),
  );
});
