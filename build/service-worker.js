// WorkflowY — app-shell service worker.
// Static shell: cache-first. Navigations: network-first with cache fallback (offline).
// API requests: never cached.

const CACHE = "workflowy-shell-v7";
const BADGE = "/workflowy-badge-v4.png?v=2"; // solid logo-tile glyph (knocked-out check + sparkle), versioned so old caches never stick
const NETWORK_FIRST_ASSETS = new Set([
  "/manifest.json",
  "/favicon.ico",
  "/workflowy-icon-192.png",
  "/workflowy-icon-512.png",
  "/workflowy-maskable-192.png",
  "/workflowy-maskable-512.png",
  "/workflowy-notif-icon.png",
  "/workflowy-badge-v4.png",
]);

self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      const names = await caches.keys();
      await Promise.all(names.filter((name) => name !== CACHE).map((name) => caches.delete(name)));
      await self.clients.claim();
    })()
  );
});

// ---------- deadline reminders (Web Push) ----------

self.addEventListener("push", (event) => {
  // Parse defensively: a malformed payload must never stop the notification
  // from showing (an empty waitUntil here is what makes pushes vanish while
  // the phone is locked).
  let title = "WorkflowY";
  let options = {
    body: "A to-do item is due.",
    icon: "/workflowy-icon-192.png",
    // Android's status bar needs a white-on-transparent glyph; a full-color
    // icon renders as a plain white square there.
    badge: BADGE,
    data: { url: "/" },
  };
  try {
    if (event.data) {
      let payload = null;
      try {
        payload = event.data.json();
      } catch {
        const text = event.data.text();
        if (text) options.body = text;
      }
      if (payload && typeof payload === "object") {
        title = String(payload.title || title);
        if (payload.body) options.body = String(payload.body);
        if (payload.tag) {
          options.tag = String(payload.tag);
          options.renotify = true; // repeat alerts replace the previous one audibly
        }
      }
    }
  } catch {}
  event.waitUntil(
    self.registration.showNotification(title, options).catch(() => {})
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    (async () => {
      const clientList = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
      for (const client of clientList) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow((event.notification.data && event.notification.data.url) || "/");
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return; // cross-origin: leave to the browser
  if (url.pathname.startsWith("/api/")) return; // live data only

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request)
        .then((response) => {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          return response;
        })
        .catch(() => caches.match(request).then((hit) => hit || caches.match("/")))
    );
    return;
  }

  // Branding metadata must not remain stuck behind a previous installed-PWA cache.
  if (NETWORK_FIRST_ASSETS.has(url.pathname)) {
    event.respondWith(
      fetch(request, { cache: "reload" })
        .then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
        .catch(() => caches.match(request))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(
      (hit) =>
        hit ||
        fetch(request).then((response) => {
          if (response.ok && response.type === "basic") {
            const copy = response.clone();
            caches.open(CACHE).then((cache) => cache.put(request, copy)).catch(() => {});
          }
          return response;
        })
    )
  );
});
