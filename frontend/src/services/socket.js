import { io } from 'socket.io-client';
import { BACKEND_URL, tokenStore } from './api';

const SOCKET_URL = BACKEND_URL;

let socket;
let activeSocketToken = '';

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 8,
    });

    socket.on('connect_error', (err) => {
      const message = String(err?.message || '');
      const isAuthError = /(auth|unauthorized|token|jwt)/i.test(message);
      if (isAuthError) {
        socket.disconnect();
      }
      if (import.meta.env.DEV) {
        console.warn('[socket] connect_error:', message || 'unknown');
      }
    });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  const token = String(tokenStore.get() || '').trim();

  if (!token) {
    activeSocketToken = '';
    if (s.connected || s.active) {
      s.disconnect();
    }
    return s;
  }

  const tokenChanged = token !== activeSocketToken;
  if (tokenChanged) {
    activeSocketToken = token;
    s.auth = { token };
    if (s.connected || s.active) {
      s.disconnect();
    }
  } else {
    s.auth = { token };
  }

  if (!s.connected && !s.active) {
    s.connect();
  }
  return s;
};

export const disconnectSocket = () => {
  activeSocketToken = '';
  if (socket?.connected) {
    socket.disconnect();
    return;
  }
  if (socket?.active) {
    socket.disconnect();
  }
};
