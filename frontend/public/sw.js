const DEFAULT_URL = '/';

const safeUrl = (value) => {
  try {
    const url = new URL(value || DEFAULT_URL, self.location.origin);
    if (url.origin !== self.location.origin) return DEFAULT_URL;
    return url.pathname + url.search + url.hash;
  } catch {
    return DEFAULT_URL;
  }
};

self.addEventListener('install', (event) => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('push', (event) => {
  let payload;

  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }

  const url = safeUrl(payload.url);
  const title = String(payload.title || 'SahaYatri').slice(0, 90);
  const tag = String(payload.tag || url || 'sahayatri').slice(0, 128);

  const options = {
    body: String(payload.body || 'You have a new update.').slice(0, 180),
    icon: '/favicon.svg',
    badge: '/favicon.svg',
    tag,
    renotify: false,
    data: {
      ...(payload.data || {}),
      url,
    },
  };

  event.waitUntil(
    (async () => {
      const existing = await self.registration.getNotifications({ tag });
      existing.forEach((notification) => notification.close());
      await self.registration.showNotification(title, options);
    })()
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetPath = safeUrl(event.notification.data?.url);
  const targetUrl = new URL(targetPath, self.location.origin).href;

  event.waitUntil(
    (async () => {
      const windowClients = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });

      const exactClient = windowClients.find((client) => {
        try {
          return new URL(client.url).href === targetUrl;
        } catch {
          return false;
        }
      });

      if (exactClient) {
        await exactClient.focus();
        return;
      }

      const appClient = windowClients.find((client) => {
        try {
          return new URL(client.url).origin === self.location.origin;
        } catch {
          return false;
        }
      });

      if (appClient) {
        await appClient.focus();
        if ('navigate' in appClient) {
          await appClient.navigate(targetUrl);
        }
        return;
      }

      await self.clients.openWindow(targetUrl);
    })()
  );
});
