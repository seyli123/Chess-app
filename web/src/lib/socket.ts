import { io, Socket } from 'socket.io-client';
import { API_BASE, tokens } from './api';

export function connect(namespace: '/game' | '/matchmaking'): Socket {
  return io(`${API_BASE}${namespace}`, {
    transports: ['websocket'],
    auth: { token: tokens.access },
    autoConnect: true,
  });
}
