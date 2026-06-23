import { io, Socket } from 'socket.io-client';
import { API_BASE, tokens } from './api';

export function connect(namespace: '/game' | '/matchmaking' | '/tournament'): Socket {
  return io(`${API_BASE}${namespace}`, {
    transports: ['websocket'],
    auth: { token: tokens.access },
    autoConnect: true,
    // forceNew so each page mount gets its own connection instead of reusing a
    // cached, previously-disconnected socket. That cached-reuse left stale
    // sockets around between games and broke re-queuing.
    forceNew: true,
  });
}
