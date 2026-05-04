import { io } from 'socket.io-client';
import { tokenStore } from './api';

const API_URL =
  import.meta.env.VITE_API_URL ||
  (import.meta.env.DEV ? 'http://localhost:5000/api' : '/api');

const SOCKET_URL = API_URL.replace(/\/api\/?$/, '');

let socket;

export const getSocket = () => {
  if (!socket) {
    socket = io(SOCKET_URL, {
      autoConnect: false,
      withCredentials: true,
      transports: ['websocket'],
    });
  }
  return socket;
};

export const connectSocket = () => {
  const s = getSocket();
  const token = tokenStore.get();

  if (!token) return s;

  s.auth = { token };
  if (!s.connected) {
    s.connect();
  }
  return s;
};

export const disconnectSocket = () => {
  if (socket?.connected) {
    socket.disconnect();
  }
};
