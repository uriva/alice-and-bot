self.addEventListener("push", (event) => {
  let data = {};
  try {
    data = event.data ? event.data.json() : {};
  } catch (_) {
    // ignore malformed payloads
  }
  event.waitUntil(self.registration.showNotification("New message", {
    body: data.conversationId
      ? `Conversation: ${data.conversationId}`
      : "You have a new message",
    icon: "/icon.png",
    badge: "/icon.png",
    data,
  }));
});

self.addEventListener("notificationclick", function (event) {
  event.notification.close();
  const d = event.notification.data || {};
  const url = d.conversationId
    ? `/chat?conversation=${encodeURIComponent(d.conversationId)}`
    : "/";
  event.waitUntil(clients.openWindow(url));
});
