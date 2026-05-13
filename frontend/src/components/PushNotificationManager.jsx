import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useDispatch, useSelector } from 'react-redux';
import {
  registerServiceWorker,
  getNotificationPermission,
  rememberPushPrompt,
  requestNotificationPermission,
  shouldPromptForPush,
  subscribeToPush,
} from '../services/pushNotifications';
import { fetchUnreadCount } from '../redux/slices/notificationSlice';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';
const isDev = import.meta.env.DEV;

const PushNotificationManager = () => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const promptedRef = useRef(false);
  const lastForegroundPushRef = useRef({ key: '', at: 0 });
  const userId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!token || !userId) return;

    registerServiceWorker().catch((err) => {
      if (isDev) {
        console.error('[push][frontend] initial service worker registration failed', err);
      }
    });

    if (getNotificationPermission() === 'granted') {
      subscribeToPush().catch((err) => {
        if (isDev) {
          console.error('[push][frontend] auto subscribe failed', err);
        }
      });
      return;
    }

    if (promptedRef.current || !shouldPromptForPush(userId)) return;

    promptedRef.current = true;
    rememberPushPrompt(userId);

    toast(
      (t) => (
        <div className="flex max-w-sm flex-col gap-3">
          <div>
            <p className="font-bold text-slate-900">Enable ride and chat alerts?</p>
            <p className="text-sm text-slate-600">
              We will only ask the browser after you tap enable.
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={async () => {
                toast.dismiss(t.id);
                try {
                  const permission = await requestNotificationPermission();
                  if (permission !== 'granted') {
                    toast.error('Notifications were not enabled.');
                    return;
                  }
                  await subscribeToPush();
                  toast.success('Push notifications enabled.');
                } catch (err) {
                  if (isDev) {
                    console.error('[push][frontend] prompt subscribe failed', err);
                  }
                  toast.error('Failed to enable notifications.');
                }
              }}
              className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-bold text-white"
            >
              Enable
            </button>
            <button
              type="button"
              onClick={() => toast.dismiss(t.id)}
              className="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-700"
            >
              Not now
            </button>
          </div>
        </div>
      ),
      { duration: 12000 }
    );
  }, [token, userId]);

  useEffect(() => {
    if (!token || !('serviceWorker' in navigator)) return undefined;

    const onMessage = (event) => {
      const payload = event?.data?.payload || {};
      const key = `${payload?.data?.notificationId || ''}:${payload?.url || ''}`;
      const now = Date.now();
      if (
        key &&
        lastForegroundPushRef.current.key === key &&
        now - Number(lastForegroundPushRef.current.at || 0) < 1500
      ) {
        return;
      }
      lastForegroundPushRef.current = { key, at: now };

      dispatch(fetchUnreadCount());
      if (document.visibilityState === 'visible' && payload?.title) {
        toast.custom(
          (t) => (
            <button
              type="button"
              onClick={() => {
                toast.dismiss(t.id);
                if (payload?.url) {
                  window.location.assign(payload.url);
                }
              }}
              className="max-w-sm rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
            >
              <p className="text-sm font-black text-slate-900">{payload.title}</p>
              <p className="mt-1 text-xs text-slate-600">{payload.body}</p>
            </button>
          ),
          { duration: 4500 }
        );
      }
    };

    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => {
      navigator.serviceWorker.removeEventListener('message', onMessage);
    };
  }, [dispatch, token]);

  return null;
};

export default PushNotificationManager;
