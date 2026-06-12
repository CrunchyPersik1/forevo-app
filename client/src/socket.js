import { io } from 'socket.io-client';

let socket = null;

function getSocketUrl() {
  // In dev, Vite proxy can be flaky for WebSocket — connect directly to the API server
  if (import.meta.env.DEV) {
    return `http://${window.location.hostname}:3001`;
  }
  return undefined;
}

export function connectSocket() {
  const token = localStorage.getItem('token');
  if (!token) return null;

  if (socket?.connected) return socket;

  if (socket) {
    socket.disconnect();
    socket = null;
  }

  socket = io(getSocketUrl(), {
    auth: { token },
    transports: ['websocket', 'polling'],
    reconnection: true,
    reconnectionAttempts: 10,
  });

  return socket;
}

export function disconnectSocket() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket() {
  return socket;
}
