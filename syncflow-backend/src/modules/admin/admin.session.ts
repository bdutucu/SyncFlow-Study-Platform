import { Server as IOServer } from 'socket.io';
import { IUserSessionEnforcer } from './admin.types';

/**
 * SocketUserSessionEnforcer — terminates all open sockets for a given
 * user by addressing the per-user Socket.IO channel.
 *
 * The channel is named `user:${userId}` and every authenticated socket
 * joins it on connect (see server.ts). Using a channel rather than
 * iterating connected sockets is O(connections to this user), not
 * O(total connections), so this scales with deployment size.
 *
 * disconnectSockets(close=true) tells the underlying transport to send a
 * proper close frame, so clients can react with their `disconnect`
 * handlers and re-prompt for login.
 */
export class SocketUserSessionEnforcer implements IUserSessionEnforcer {
  constructor(private readonly io: IOServer) {}

  async disconnectAllSocketsForUser(userId: string): Promise<void> {
    await this.io.in(userChannel(userId)).disconnectSockets(true);
  }
}

export const userChannel = (userId: string): string => `user:${userId}`;
