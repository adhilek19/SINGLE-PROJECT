import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { notificationService } from '../../services/api';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const initialState = {
  items: [],
  unreadCount: 0,
  status: 'idle',
  error: null,
  markBusyById: {},
};

const mergeNotification = (items, incoming) => {
  const incomingId = toId(incoming?._id);
  if (!incomingId) return items;
  const next = [incoming, ...items.filter((item) => toId(item?._id) !== incomingId)];
  return next.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
};

export const fetchNotifications = createAsyncThunk(
  'notifications/fetchNotifications',
  async ({ page = 1, limit = 20 } = {}, { rejectWithValue }) => {
    try {
      const res = await notificationService.getNotifications({ page, limit });
      return res.data?.data || { notifications: [], pagination: {} };
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch notifications');
    }
  }
);

export const fetchUnreadCount = createAsyncThunk(
  'notifications/fetchUnreadCount',
  async (_, { rejectWithValue }) => {
    try {
      const res = await notificationService.getUnreadCount();
      return Number(res.data?.data?.unreadCount || 0);
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to fetch unread count');
    }
  }
);

export const markNotificationRead = createAsyncThunk(
  'notifications/markRead',
  async (notificationId, { rejectWithValue }) => {
    try {
      const res = await notificationService.markRead(notificationId);
      return res.data?.data?.notification || null;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark notification read');
    }
  }
);

export const markAllNotificationsRead = createAsyncThunk(
  'notifications/markAllRead',
  async (_, { rejectWithValue }) => {
    try {
      await notificationService.markAllRead();
      return true;
    } catch (err) {
      return rejectWithValue(err.response?.data?.message || 'Failed to mark all read');
    }
  }
);

const notificationSlice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    socketNotificationReceived(state, action) {
      const notification = action.payload?.notification || action.payload;
      if (!notification?._id) return;
      state.items = mergeNotification(state.items, notification);
      if (!notification.isRead) {
        state.unreadCount = Number(state.unreadCount || 0) + 1;
      }
    },
    socketNotificationRead(state, action) {
      const all = Boolean(action.payload?.all);
      if (all) {
        state.items = state.items.map((item) => ({ ...item, isRead: true, readAt: new Date().toISOString() }));
        state.unreadCount = 0;
        return;
      }
      const notificationId = toId(action.payload?.notificationId);
      if (!notificationId) return;
      state.items = state.items.map((item) => {
        if (toId(item?._id) !== notificationId) return item;
        if (item.isRead) return item;
        return { ...item, isRead: true, readAt: new Date().toISOString() };
      });
      state.unreadCount = Math.max(
        0,
        state.items.reduce((sum, item) => sum + (item.isRead ? 0 : 1), 0)
      );
    },
    socketUnreadCountUpdated(state, action) {
      state.unreadCount = Math.max(0, Number(action.payload?.unreadCount || 0));
    },
    clearNotificationsState(state) {
      state.items = [];
      state.unreadCount = 0;
      state.status = 'idle';
      state.error = null;
      state.markBusyById = {};
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(fetchNotifications.pending, (state) => {
        state.status = 'loading';
        state.error = null;
      })
      .addCase(fetchNotifications.fulfilled, (state, action) => {
        state.status = 'succeeded';
        const list = Array.isArray(action.payload?.notifications)
          ? action.payload.notifications
          : [];
        state.items = list.sort((a, b) => new Date(b?.createdAt || 0).getTime() - new Date(a?.createdAt || 0).getTime());
        state.unreadCount = list.reduce((sum, item) => sum + (item?.isRead ? 0 : 1), 0);
      })
      .addCase(fetchNotifications.rejected, (state, action) => {
        state.status = 'failed';
        state.error = action.payload || 'Failed to fetch notifications';
      })
      .addCase(fetchUnreadCount.fulfilled, (state, action) => {
        state.unreadCount = Math.max(0, Number(action.payload || 0));
      })
      .addCase(markNotificationRead.pending, (state, action) => {
        const notificationId = toId(action.meta.arg);
        if (notificationId) {
          state.markBusyById[notificationId] = true;
        }
      })
      .addCase(markNotificationRead.fulfilled, (state, action) => {
        const notification = action.payload;
        const notificationId = toId(notification?._id);
        if (notificationId) {
          delete state.markBusyById[notificationId];
          state.items = state.items.map((item) =>
            toId(item?._id) === notificationId
              ? { ...item, ...notification, isRead: true, readAt: notification.readAt || item.readAt || new Date().toISOString() }
              : item
          );
        }
        state.unreadCount = Math.max(
          0,
          state.items.reduce((sum, item) => sum + (item.isRead ? 0 : 1), 0)
        );
      })
      .addCase(markNotificationRead.rejected, (state, action) => {
        const notificationId = toId(action.meta.arg);
        if (notificationId) delete state.markBusyById[notificationId];
        state.error = action.payload || 'Failed to mark notification read';
      })
      .addCase(markAllNotificationsRead.fulfilled, (state) => {
        state.items = state.items.map((item) => ({ ...item, isRead: true, readAt: item.readAt || new Date().toISOString() }));
        state.unreadCount = 0;
      });
  },
});

export const {
  socketNotificationReceived,
  socketNotificationRead,
  socketUnreadCountUpdated,
  clearNotificationsState,
} = notificationSlice.actions;

export default notificationSlice.reducer;
