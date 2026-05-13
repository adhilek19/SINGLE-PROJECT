import { useEffect } from 'react';
import { CheckCheck } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from '../redux/slices/notificationSlice';
import EmptyState from '../components/common/EmptyState';
import Skeleton from '../components/common/Skeleton';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatDateTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleString();
  } catch {
    return '';
  }
};

const Notifications = () => {
  const dispatch = useDispatch();
  const items = useSelector((state) => state.notifications.items);
  const status = useSelector((state) => state.notifications.status);
  const error = useSelector((state) => state.notifications.error);
  const markBusyById = useSelector((state) => state.notifications.markBusyById);

  useEffect(() => {
    if (status === 'idle') {
      dispatch(fetchNotifications({ page: 1, limit: 40 }));
    }
  }, [dispatch, status]);

  if (status === 'loading') {
    return (
      <div className="flex-grow bg-slate-50 px-4 py-6">
        <div className="mx-auto max-w-3xl space-y-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Skeleton key={index} className="h-20" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex-grow bg-slate-50 px-4 py-6">
      <div className="mx-auto max-w-3xl space-y-4">
        <div className="flex items-center justify-between rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
          <div>
            <h1 className="text-xl font-black text-slate-900">Notifications</h1>
            <p className="text-sm text-slate-500">Ride requests, messages, and system updates.</p>
          </div>
          <button
            type="button"
            onClick={() => dispatch(markAllNotificationsRead())}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-3 py-2 text-xs font-bold text-slate-700"
          >
            <CheckCheck className="h-3.5 w-3.5" />
            Mark all read
          </button>
        </div>

        {error ? (
          <div className="rounded-2xl border border-rose-200 bg-rose-50 p-4 text-sm font-semibold text-rose-700">
            {error}
          </div>
        ) : null}

        {!items.length ? (
          <EmptyState title="No notifications yet" description="You are all caught up." />
        ) : (
          <div className="space-y-2">
            {items.map((item) => {
              const id = toId(item?._id);
              const busy = Boolean(markBusyById[id]);
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    if (!item?.isRead && id && !busy) {
                      dispatch(markNotificationRead(id));
                    }
                    if (item?.url) {
                      window.location.assign(item.url);
                    }
                  }}
                  className={`w-full rounded-2xl border p-4 text-left shadow-sm transition ${
                    item?.isRead
                      ? 'border-slate-200 bg-white hover:bg-slate-50'
                      : 'border-blue-200 bg-blue-50 hover:bg-blue-100/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="truncate text-sm font-black text-slate-900">{item?.title}</h2>
                      <p className="mt-1 text-sm text-slate-600">{item?.body}</p>
                      <p className="mt-2 text-xs font-semibold text-slate-400">
                        {formatDateTime(item?.createdAt)}
                      </p>
                    </div>
                    {!item?.isRead ? <span className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600" /> : null}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

export default Notifications;
