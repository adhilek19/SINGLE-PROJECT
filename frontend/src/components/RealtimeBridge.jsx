import { useEffect, useRef } from 'react';
import { useDispatch, useSelector } from 'react-redux';
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
  onSocketConnectError,
  onStopTyping,
  onTyping,
  onUserOffline,
  onUserOnline,
} from '../services/chatSocket';
import { disconnectSocket } from '../services/socket';

const toId = (value) =>
  (value && typeof value === 'object' ? value._id : value)?.toString?.() || '';

const RealtimeBridge = () => {
  const dispatch = useDispatch();
  const token = useSelector((state) => state.auth.token);
  const user = useSelector((state) => state.auth.user);
  const isHydrated = useSelector((state) => state.auth.isHydrated);
  const isInitializing = useSelector((state) => state.auth.isInitializing);
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const joinedChatIdsRef = useRef(new Set());

  const currentUserId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!isHydrated || isInitializing || !token || !currentUserId) return;

    connectChatSocket();
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
  }, [isHydrated, isInitializing, token, currentUserId, chatsStatus, dispatch]);

  useEffect(() => {
    if (!isHydrated || isInitializing || !token || !currentUserId) {
      joinedChatIdsRef.current.clear();
      clearJoinedChatState();
      disconnectSocket();
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
  }, [isHydrated, isInitializing, token, currentUserId, chats]);

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
