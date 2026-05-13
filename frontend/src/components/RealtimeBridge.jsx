import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
import toast from 'react-hot-toast';
import {
  getMyChats,
  socketMessageDelivered,
  socketMessageReaction,
  socketMessageReceived,
  socketMessageSeen,
  socketOnlineUsers,
  socketStopTyping,
  socketTyping,
  socketUserOffline,
  socketUserOnline,
} from '../redux/slices/chatSlice';
import {
  clearNotificationsState,
  fetchNotifications,
  fetchUnreadCount,
  socketNotificationRead,
  socketNotificationReceived,
  socketUnreadCountUpdated,
} from '../redux/slices/notificationSlice';
import {
  fetchMyRidesThunk,
  socketRideCancelled,
  socketRideCreated,
  socketRideUpdated,
} from '../redux/slices/rideSlice';
import {
  clearJoinedChatState,
  connectChatSocket,
  joinChat,
  leaveChat,
  onMessageDelivered,
  onMessageReaction,
  onMessageSeen,
  onOnlineUsers,
  onReceiveMessage,
  onRideCancelled,
  onRideCreated,
  onRideStarted,
  onRideTrackingEnabled,
  onPassengerVerified,
  onRideJoinAccepted,
  onRideJoinRejected,
  onRideJoinRequested,
  onRideUpdated,
  onNotificationNew,
  onNotificationRead,
  onUnreadCount,
  onSocketConnectError,
  onStopTyping,
  onTyping,
  onUserOfflineAlias,
  onUserOnlineAlias,
  onUserOffline,
  onUserOnline,
} from '../services/chatSocket';
import { disconnectSocket } from '../services/socket';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const playNotificationSound = () => {
  if (typeof window === 'undefined') return;
  try {
    const AudioContextRef = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextRef) return;
    const ctx = new AudioContextRef();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, ctx.currentTime);
    gain.gain.setValueAtTime(0.001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.06, ctx.currentTime + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.18);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.2);
    osc.onended = () => {
      ctx.close().catch(() => {});
    };
  } catch {
    // noop
  }
};

const RealtimeBridge = () => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const isHydrated = useSelector((state) => state.auth.isHydrated);
  const isInitializing = useSelector((state) => state.auth.isInitializing);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const notificationsStatus = useSelector((state) => state.notifications.status);
  const joinedChatIdsRef = useRef(new Set());
  const lastToastRef = useRef({ key: '', at: 0 });

  const currentUserId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!isHydrated || isInitializing || !token || !currentUserId) return;

    connectChatSocket();
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
    if (notificationsStatus === 'idle') {
      dispatch(fetchNotifications({ page: 1, limit: 20 }));
    }
    dispatch(fetchUnreadCount());
  }, [isHydrated, isInitializing, token, currentUserId, chatsStatus, notificationsStatus, dispatch]);

  useEffect(() => {
    if (!isHydrated || isInitializing || !token || !currentUserId) {
      joinedChatIdsRef.current.clear();
      clearJoinedChatState();
      disconnectSocket();
      dispatch(clearNotificationsState());
      return;
    }

    const desiredIds = new Set(
      (chats || []).map((chat) => toId(chat?._id)).filter(Boolean)
    );

    desiredIds.forEach((chatId) => {
      if (joinedChatIdsRef.current.has(chatId)) return;
      joinedChatIdsRef.current.add(chatId);
      joinChat(chatId).catch(() => {
        joinedChatIdsRef.current.delete(chatId);
      });
    });

    Array.from(joinedChatIdsRef.current).forEach((chatId) => {
      if (desiredIds.has(chatId)) return;
      joinedChatIdsRef.current.delete(chatId);
      leaveChat(chatId).catch(() => {});
    });
  }, [isHydrated, isInitializing, token, currentUserId, chats, dispatch]);

  useEffect(
    () => () => {
      joinedChatIdsRef.current.clear();
      clearJoinedChatState();
      disconnectSocket();
    },
    []
  );

  useEffect(() => {
    if (!isHydrated || isInitializing || !token || !currentUserId) return undefined;

    const syncMyRides = () => {
      dispatch(fetchMyRidesThunk());
    };

    const rideFromPayload = (payload) =>
      payload?.ride ||
      (payload?.request?.ride && typeof payload.request.ride === 'object'
        ? payload.request.ride
        : null);

    const unsubscribers = [
      onReceiveMessage((payload) =>
        dispatch(socketMessageReceived({ ...payload, currentUserId }))
      ),
      onMessageSeen((payload) => dispatch(socketMessageSeen(payload))),
      onMessageDelivered((payload) => dispatch(socketMessageDelivered(payload))),
      onMessageReaction((payload) => dispatch(socketMessageReaction(payload))),
      onTyping((payload) => dispatch(socketTyping(payload))),
      onStopTyping((payload) => dispatch(socketStopTyping(payload))),
      onOnlineUsers((payload) => dispatch(socketOnlineUsers(payload))),
      onUserOnline((payload) => dispatch(socketUserOnline(payload))),
      onUserOffline((payload) => dispatch(socketUserOffline(payload))),
      onUserOnlineAlias((payload) => dispatch(socketUserOnline(payload))),
      onUserOfflineAlias((payload) => dispatch(socketUserOffline(payload))),
      onNotificationNew((payload) => {
        const notification = payload?.notification || {};
        const key = `${toId(notification?._id)}:${notification?.type || ''}`;
        const now = Date.now();
        const duplicate =
          lastToastRef.current.key === key && now - Number(lastToastRef.current.at || 0) < 1200;

        dispatch(socketNotificationReceived(payload));
        if (!duplicate && notification?.title) {
          lastToastRef.current = { key, at: now };
          playNotificationSound();
          toast.custom(
            (t) => (
              <button
                type="button"
                onClick={() => {
                  toast.dismiss(t.id);
                  if (notification?.url) {
                    window.location.assign(notification.url);
                  }
                }}
                className="max-w-sm rounded-xl border border-slate-200 bg-white p-3 text-left shadow-lg"
              >
                <p className="text-sm font-black text-slate-900">{notification.title}</p>
                <p className="mt-1 text-xs text-slate-600">{notification.body}</p>
              </button>
            ),
            { duration: 5000 }
          );
        }
      }),
      onNotificationRead((payload) => dispatch(socketNotificationRead(payload))),
      onUnreadCount((payload) => dispatch(socketUnreadCountUpdated(payload))),
      onSocketConnectError((err) => {
        if (import.meta.env.DEV) {
          const message = String(err?.message || 'socket connect error');
          console.warn('[socket] connect_error:', message);
        }
      }),
      onRideCreated((payload) => {
        dispatch(socketRideCreated(payload));
        syncMyRides();
      }),
      onRideUpdated((payload) => {
        dispatch(socketRideUpdated(payload));
        syncMyRides();
      }),
      onRideCancelled((payload) => {
        dispatch(socketRideCancelled(payload));
        syncMyRides();
      }),
      onRideJoinRequested((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
      onRideJoinAccepted((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
      onRideJoinRejected((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
      onPassengerVerified((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
      onRideStarted((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
      onRideTrackingEnabled((payload) => {
        const ride = rideFromPayload(payload);
        if (ride) {
          dispatch(socketRideUpdated({ ride }));
        }
        syncMyRides();
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [isHydrated, isInitializing, token, currentUserId, dispatch]);

  return null;
};

export default RealtimeBridge;
