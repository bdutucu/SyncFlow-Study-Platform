import { io, Socket } from 'socket.io-client';
import { useAuth } from './auth-store';
import { forceLogoutBanned } from './api';

let socket: Socket | null = null;

export function getSocket(): Socket {
  const token = useAuth.getState().tokens?.accessToken;
  if (!socket) {
    socket = io('/', {
      autoConnect: false,
      transports: ['websocket'],
      auth: { token },
    });
    // When the server rejects (re)connect — most importantly because the
    // user was just banned — terminate the local session. The server
    // throws the literal string 'UNAUTHENTICATED' from the auth
    // middleware after re-checking ban status on every connect.
    socket.on('connect_error', (err) => {
      if (err?.message === 'UNAUTHENTICATED') {
        forceLogoutBanned(null);
      }
    });
  } else {
    socket.auth = { token };
  }
  return socket;
}

export function connectSocket(): Socket {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket(): void {
  if (socket?.connected) socket.disconnect();
}

/** Promise-flavored emit-with-ack. */
export function emitAck<T = unknown>(
  event: string,
  ...args: unknown[]
): Promise<T> {
  const s = getSocket();
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('TIMEOUT')), 8000);
    s.emit(event, ...args, (res: { ok: boolean; error?: string } & Record<string, unknown>) => {
      clearTimeout(timeout);
      if (res?.ok) resolve(res as T);
      else reject(new Error(res?.error ?? 'UNKNOWN'));
    });
  });
}
