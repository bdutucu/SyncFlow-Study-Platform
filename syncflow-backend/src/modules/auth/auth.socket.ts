import { Server as IOServer, Socket } from 'socket.io';
import { verifyAccessToken } from '../../shared/jwt';
import { AuthService } from './auth.service';
import { AuthenticatedUser } from './auth.types';

/**
 * Socket.IO connection-level authentication.
 *
 * On every (re)connect we:
 *   1. Read the access token from `socket.handshake.auth.token` (preferred)
 *      or the `Authorization: Bearer ...` header.
 *   2. Verify the JWT signature and expiry.
 *   3. Look up the user in the database and reject if `isBanned`.
 *      This implements the DSD §3.5.5 guarantee that "the next Socket
 *      reconnection fails even if the token is still technically valid".
 *
 * Client usage:
 *
 *   const socket = io('http://localhost:3000', {
 *     auth: { token: accessToken },
 *   });
 *
 * After this middleware accepts the connection, downstream handlers may
 * read `socket.data.user` for `{ id, role }`.
 */

declare module 'socket.io' {
  interface SocketData {
    user?: AuthenticatedUser;
  }
}

export function buildSocketAuthMiddleware(authService: AuthService) {
  return async (socket: Socket, next: (err?: Error) => void): Promise<void> => {
    try {
      const raw =
        (socket.handshake.auth?.token as string | undefined) ??
        extractFromAuthHeader(socket.handshake.headers.authorization);

      if (!raw) {
        return next(new Error('UNAUTHENTICATED'));
      }

      const payload = verifyAccessToken(raw);
      const user = await authService.resolveAuthenticatedUser(payload.sub);
      socket.data.user = user;
      next();
    } catch {
      next(new Error('UNAUTHENTICATED'));
    }
  };
}

function extractFromAuthHeader(header: string | undefined): string | undefined {
  if (!header || !header.startsWith('Bearer ')) return undefined;
  const token = header.slice('Bearer '.length).trim();
  return token.length > 0 ? token : undefined;
}

/** Convenience: register the middleware on an io server. */
export function attachSocketAuth(io: IOServer, authService: AuthService): void {
  io.use(buildSocketAuthMiddleware(authService));
}
