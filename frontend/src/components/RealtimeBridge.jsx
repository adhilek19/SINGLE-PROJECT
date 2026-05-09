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
  onRideJoinAccepted,
  onRideJoinRejected,
  onRideJoinRequested,
  onRideUpdated,
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
  const chats = useSelector((state) => state.chat.chats);
  const chatsStatus = useSelector((state) => state.chat.chatsStatus);
  const joinedChatIdsRef = useRef(new Set());

  const currentUserId = toId(user?._id || user?.id);

  useEffect(() => {
    if (!token || !currentUserId) return;

    connectChatSocket();
    if (chatsStatus === 'idle') {
      dispatch(getMyChats());
    }
  }, [token, currentUserId, chatsStatus, dispatch]);

  useEffect(() => {
    if (!token || !currentUserId) {
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
  }, [token, currentUserId, chats]);

  useEffect(
    () => () => {
      joinedChatIdsRef.current.clear();
      clearJoinedChatState();
      disconnectSocket();
    },
    []
  );

  useEffect(() => {
    if (!token || !currentUserId) return undefined;

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
      onRideCreated((payload) => dispatch(socketRideCreated(payload))),
      onRideUpdated((payload) => dispatch(socketRideUpdated(payload))),
      onRideCancelled((payload) => dispatch(socketRideCancelled(payload))),
      onRideJoinRequested((payload) => {
        if (payload?.request?.ride && typeof payload.request.ride === 'object') {
          dispatch(socketRideUpdated({ ride: payload.request.ride }));
        }
      }),
      onRideJoinAccepted((payload) => {
        if (payload?.request?.ride && typeof payload.request.ride === 'object') {
          dispatch(socketRideUpdated({ ride: payload.request.ride }));
        }
      }),
      onRideJoinRejected((payload) => {
        if (payload?.request?.ride && typeof payload.request.ride === 'object') {
          dispatch(socketRideUpdated({ ride: payload.request.ride }));
        }
      }),
    ];

    return () => {
      unsubscribers.forEach((unsubscribe) => unsubscribe?.());
    };
  }, [token, currentUserId, dispatch]);

  return null;
};

export default RealtimeBridge;
