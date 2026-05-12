import api from './api';

const PROMPT_INTERVAL_MS = 7 * 24 * 60 * 60 * 1000;
const isDev = import.meta.env.DEV;
const FRONTEND_PUSH_LOG_PREFIX = '[push][frontend]';

const debugPush = (message, meta) => {
  if (!isDev) return;
  if (meta !== undefined) {
    console.info(`${FRONTEND_PUSH_LOG_PREFIX} ${message}`, meta);
    return;
  }
  console.info(`${FRONTEND_PUSH_LOG_PREFIX} ${message}`);
};

const endpointPrefix = (endpoint = '') => String(endpoint || '').slice(0, 80);

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
};

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window;

export const getNotificationPermission = () => {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
};

export const registerServiceWorker = async () => {
  if (!isPushSupported()) {
    debugPush('service worker registration skipped', { reason: 'push_unsupported' });
    return { supported: false, registration: null };
  }

  if (isDev) {
    try {
      const probe = await fetch('/sw.js', { cache: 'no-store' });
      const contentType = probe.headers.get('content-type') || '';
      debugPush('sw.js probe', {
        ok: probe.ok,
        status: probe.status,
        contentType,
      });
      if (contentType.toLowerCase().includes('text/html')) {
        console.warn(
          `${FRONTEND_PUSH_LOG_PREFIX} sw.js appears to be served as HTML. Service worker registration will fail.`
        );
      }
    } catch (err) {
      console.warn(`${FRONTEND_PUSH_LOG_PREFIX} sw.js probe failed`, err);
    }
  }

  let registration;
  try {
    registration = await navigator.serviceWorker.register('/sw.js', {
      scope: '/',
    });
  } catch (err) {
    if (isDev) {
      console.error(`${FRONTEND_PUSH_LOG_PREFIX} service worker registration failed`, err);
    }
    throw err;
  }

  const readyRegistration = await navigator.serviceWorker.ready;

  debugPush('service worker registered', {
    scope: readyRegistration.scope,
    installing: registration.installing
      ? {
          state: registration.installing.state,
          scriptURL: registration.installing.scriptURL,
        }
      : null,
    waiting: readyRegistration.waiting
      ? {
          state: readyRegistration.waiting.state,
          scriptURL: readyRegistration.waiting.scriptURL,
        }
      : null,
    active: readyRegistration.active
      ? {
          state: readyRegistration.active.state,
          scriptURL: readyRegistration.active.scriptURL,
        }
      : null,
  });

  return { supported: true, registration: readyRegistration };
};

export const requestNotificationPermission = async () => {
  if (!isPushSupported()) return 'unsupported';
  if (Notification.permission !== 'default') return Notification.permission;
  return new Promise((resolve) => {
    const result = Notification.requestPermission((permission) => {
      resolve(permission || Notification.permission);
    });

    if (result && typeof result.then === 'function') {
      result
        .then((permission) => resolve(permission || Notification.permission))
        .catch(() => resolve(Notification.permission));
    }
  });
};

const fetchVapidPublicKey = async () => {
  const response = await api.get('/notifications/vapid-public-key');
  return response.data?.data?.publicKey || '';
};

const sendSubscriptionToBackend = (subscription) =>
  api.post('/notifications/subscribe', {
    subscription: subscription.toJSON(),
  });

export const subscribeToPush = async () => {
  const { supported, registration } = await registerServiceWorker();
  if (!supported || !registration) {
    debugPush('push subscribe skipped', { reason: 'push_unsupported_or_no_registration' });
    return { ok: false, status: 'unsupported' };
  }

  if (Notification.permission !== 'granted') {
    debugPush('push subscribe skipped', {
      reason: 'permission_not_granted',
      permission: Notification.permission,
    });
    return { ok: false, status: Notification.permission };
  }

  const existing = await registration.pushManager.getSubscription();
  if (existing) {
    await sendSubscriptionToBackend(existing);
    debugPush('push subscription synced', {
      source: 'existing',
      endpointPrefix: endpointPrefix(existing.endpoint),
    });
    return { ok: true, status: 'subscribed', subscription: existing };
  }

  const publicKey = await fetchVapidPublicKey();
  if (!publicKey) {
    return { ok: false, status: 'missing_vapid_key' };
  }

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  await sendSubscriptionToBackend(subscription);
  debugPush('push subscription created', {
    source: 'new',
    endpointPrefix: endpointPrefix(subscription.endpoint),
  });
  return { ok: true, status: 'subscribed', subscription };
};

export const unsubscribeFromPush = async () => {
  if (!isPushSupported()) {
    return { ok: false, status: 'unsupported' };
  }

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();
  if (!subscription) {
    return { ok: true, status: 'not_subscribed' };
  }

  const endpoint = subscription.endpoint;
  let backendError = null;
  try {
    await api.delete('/notifications/unsubscribe', {
      data: { endpoint },
    });
  } catch (err) {
    backendError = err;
  }

  await subscription.unsubscribe();
  debugPush('push subscription removed', {
    endpointPrefix: endpointPrefix(endpoint),
    backendError: Boolean(backendError),
  });

  if (backendError) throw backendError;

  return { ok: true, status: 'unsubscribed' };
};

export const getPushSubscriptionStatus = async () => {
  if (!isPushSupported()) {
    return { supported: false, permission: 'unsupported', subscribed: false };
  }

  const registration = await navigator.serviceWorker.getRegistration('/');
  const subscription = await registration?.pushManager?.getSubscription();

  return {
    supported: true,
    permission: Notification.permission,
    subscribed: Boolean(subscription),
  };
};

export const shouldPromptForPush = (userId) => {
  if (!isPushSupported() || Notification.permission !== 'default') return false;
  const key = `sahayatri:pushPromptedAt:${userId || 'anon'}`;
  const lastPromptedAt = Number(localStorage.getItem(key) || 0);
  return Date.now() - lastPromptedAt > PROMPT_INTERVAL_MS;
};

export const rememberPushPrompt = (userId) => {
  const key = `sahayatri:pushPromptedAt:${userId || 'anon'}`;
  localStorage.setItem(key, String(Date.now()));
};
