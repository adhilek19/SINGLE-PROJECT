import { useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { useSelector } from 'react-redux';
import {
  registerServiceWorker,
  getNotificationPermission,
  rememberPushPrompt,
  requestNotificationPermission,
  shouldPromptForPush,
  subscribeToPush,
} from '../services/pushNotifications';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const PushNotificationManager = () => {
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const promptedRef = useRef(false);
  const userId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!token || !userId) return;

    registerServiceWorker().catch(() => {});

    if (getNotificationPermission() === 'granted') {
      subscribeToPush().catch(() => {});
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
                const permission = await requestNotificationPermission();
                if (permission !== 'granted') {
                  toast.error('Notifications were not enabled.');
                  return;
                }
                await subscribeToPush();
                toast.success('Push notifications enabled.');
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

  return null;
};

export default PushNotificationManager;
