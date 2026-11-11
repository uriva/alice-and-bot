self.addEventListener("push", (event) => {
  const parsePayload = () => {
    try {
      return event.data ? event.data.json() : {};
    } catch (_) {
      return {};
    }
  };
  const data = parsePayload();
  const title = data.senderName || data.conversationTitle || "New message";
  const body = data.senderName && data.conversationTitle &&
      data.senderName !== data.conversationTitle
    ? `New reply in ${data.conversationTitle}`
    : "New reply waiting for you";
  event.waitUntil(
    clients
      .matchAll({ type: "window", includeUncontrolled: true })
      .then((windowClients) => {
        if (windowClients.some((c) => c.focused && c.url.includes("/chat"))) {
          return;
        }
        return self.registration.showNotification(title, {
          body,
          icon: "/icon-192.png",
          badge: "/icon-192.png",
          tag: data.conversationId || "alice-chat",
          renotify: true,
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
    clients.matchAll({ type: "window", includeUncontrolled: true }).then(
      (windowClients) => {
        const existing = windowClients.find((w) => w.url.includes("/chat"));
        if (existing) {
          existing.navigate(url);
          return existing.focus();
        }
        return clients.openWindow(url);
      },
    ),
  );
});
