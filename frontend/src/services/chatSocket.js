import { connectSocket, getSocket } from './socket';

const joinedChatIds = new Set();
let reconnectHandlerAttached = false;

const attachReconnectHandler = (socket) => {
  if (reconnectHandlerAttached) return;
  reconnectHandlerAttached = true;

  socket.on('connect', () => {
    joinedChatIds.forEach((chatId) => {
      socket.emit('join_chat', { chatId });
    });
  });
};

const emitWithAck = (event, payload = {}) =>
  new Promise((resolve, reject) => {
    const socket = connectSocket();
    attachReconnectHandler(socket);
    socket.emit(event, payload, (response) => {
      if (response?.ok) {
        resolve(response);
        return;
      }
      reject(new Error(response?.message || `${event} failed`));
    });
  });

const emitWithoutAck = (event, payload = {}) => {
  const socket = connectSocket();
  attachReconnectHandler(socket);
  socket.emit(event, payload);
};

const subscribe = (event, handler) => {
  const socket = connectSocket();
  attachReconnectHandler(socket);
  socket.on(event, handler);
  return () => socket.off(event, handler);
};

export const connectChatSocket = () => {
  const socket = connectSocket();
  attachReconnectHandler(socket);
  return socket;
};

export const getChatSocket = () => getSocket();

export const clearJoinedChatState = () => {
  joinedChatIds.clear();
};

export const joinChat = (chatId) => {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) return Promise.reject(new Error('chatId is required'));
  joinedChatIds.add(safeChatId);
  return emitWithAck('join_chat', { chatId: safeChatId });
};

export const leaveChat = (chatId) => {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) return Promise.reject(new Error('chatId is required'));
  joinedChatIds.delete(safeChatId);
  return emitWithAck('leave_chat', { chatId: safeChatId });
};

export const sendSocketMessage = ({ chatId, text }) =>
  emitWithAck('send_message', { chatId, text });

export const sendTyping = (chatId) => {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) return;
  emitWithoutAck('typing', { chatId: safeChatId });
};

export const sendStopTyping = (chatId) => {
  const safeChatId = String(chatId || '').trim();
  if (!safeChatId) return;
  emitWithoutAck('stop_typing', { chatId: safeChatId });
};

export const sendMessageSeen = (messageId) =>
  emitWithAck('message_seen', { messageId });

export const sendMessageReaction = ({ messageId, emoji }) =>
  emitWithAck('message_reaction', { messageId, emoji });

export const onReceiveMessage = (handler) => subscribe('receive_message', handler);
export const onMessageSeen = (handler) => subscribe('message_seen', handler);
export const onMessageDelivered = (handler) =>
  subscribe('message_delivered', handler);
export const onMessageReaction = (handler) =>
  subscribe('message_reaction', handler);
export const onTyping = (handler) => subscribe('typing', handler);
export const onStopTyping = (handler) => subscribe('stop_typing', handler);
export const onUserOnline = (handler) => subscribe('user_online', handler);
export const onUserOffline = (handler) => subscribe('user_offline', handler);
export const onOnlineUsers = (handler) => subscribe('online_users', handler);

export const onRideCreated = (handler) => subscribe('ride_created', handler);
export const onRideUpdated = (handler) => subscribe('ride_updated', handler);
export const onRideCancelled = (handler) => subscribe('ride_cancelled', handler);
export const onRideJoinRequested = (handler) =>
  subscribe('ride_join_requested', handler);
export const onRideJoinAccepted = (handler) =>
  subscribe('ride_join_accepted', handler);
export const onRideJoinRejected = (handler) =>
  subscribe('ride_join_rejected', handler);
