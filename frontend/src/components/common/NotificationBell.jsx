import { useMemo, useState } from 'react';
import { Bell, CheckCheck } from 'lucide-react';
import { useDispatch, useSelector } from 'react-redux';
import { Link } from 'react-router-dom';
import {
  markAllNotificationsRead,
  markNotificationRead,
} from '../../redux/slices/notificationSlice';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const formatTime = (value) => {
  if (!value) return '';
  try {
    return new Date(value).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '';
  }
};

const NotificationBell = () => {
  const dispatch = useDispatch();
  const items = useSelector((state) => state.notifications.items);
  const unreadCount = useSelector((state) => state.notifications.unreadCount);
  const markBusyById = useSelector((state) => state.notifications.markBusyById);
  const [open, setOpen] = useState(false);

  const previewItems = useMemo(() => items.slice(0, 8), [items]);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className="relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-blue-600"
        aria-label="Notifications"
      >
        <Bell className="h-5 w-5" />
        {unreadCount > 0 ? (
          <span className="absolute -right-1 -top-1 inline-flex min-w-5 items-center justify-center rounded-full bg-rose-600 px-1.5 text-[10px] font-black text-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 z-50 mt-2 w-[340px] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
          <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2">
            <p className="text-sm font-black text-slate-900">Notifications</p>
            <button
              type="button"
              onClick={() => dispatch(markAllNotificationsRead())}
              className="inline-flex items-center gap-1 rounded-lg bg-slate-100 px-2 py-1 text-[11px] font-bold text-slate-700"
            >
              <CheckCheck className="h-3.5 w-3.5" />
              Mark all
            </button>
          </div>

          <div className="max-h-80 overflow-y-auto">
            {previewItems.length ? (
              previewItems.map((item) => {
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
                      setOpen(false);
                      if (item?.url) {
                        window.location.assign(item.url);
                      }
                    }}
                    className={`w-full border-b border-slate-100 px-3 py-2 text-left transition hover:bg-slate-50 ${
                      item?.isRead ? 'bg-white' : 'bg-blue-50/60'
                    }`}
                  >
                    <p className="text-xs font-black text-slate-900">{item?.title}</p>
                    <p className="mt-0.5 line-clamp-2 text-xs text-slate-600">{item?.body}</p>
                    <p className="mt-1 text-[10px] font-semibold text-slate-400">
                      {formatTime(item?.createdAt)}
                    </p>
                  </button>
                );
              })
            ) : (
              <div className="px-4 py-8 text-center text-sm font-semibold text-slate-500">
                No notifications yet.
              </div>
            )}
          </div>

          <div className="border-t border-slate-100 px-3 py-2 text-right">
            <Link
              to="/notifications"
              onClick={() => setOpen(false)}
              className="text-xs font-bold text-blue-700 hover:text-blue-800"
            >
              View all notifications
            </Link>
          </div>
        </div>
      ) : null}
    </div>
  );
};

export default NotificationBell;
