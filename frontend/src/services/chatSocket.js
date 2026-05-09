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
export const sendTyping = (chatId) => emitWithAck('typing', { chatId });
export const sendStopTyping = (chatId) => emitWithAck('stop_typing', { chatId });
export const sendMessageSeen = (messageId) =>
  emitWithAck('message_seen', { messageId });

export const onReceiveMessage = (handler) => subscribe('receive_message', handler);
export const onMessageSeen = (handler) => subscribe('message_seen', handler);
export const onMessageDelivered = (handler) =>
  subscribe('message_delivered', handler);
export const onTyping = (handler) => subscribe('typing', handler);
export const onStopTyping = (handler) => subscribe('stop_typing', handler);
export const onUserOnline = (handler) => subscribe('user_online', handler);
export const onUserOffline = (handler) => subscribe('user_offline', handler);
