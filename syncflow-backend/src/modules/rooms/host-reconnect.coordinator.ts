import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import { RoomService } from './room.service';
import { AuthenticatedUser } from '../auth/auth.types';

interface PendingHostExit {
  roomId: string;
  user: AuthenticatedUser;
  timeoutHandle: NodeJS.Timeout;
}

/**
 * HostReconnectCoordinator — DSD §3.5.7 / SRS Use Case #11.
 *
 * When the host's last open socket disconnects, the room must NOT
 * immediately promote a new host. Instead, the host gets a grace window
 * (default 30 s, configurable via HOST_RECONNECT_GRACE_MS) to
 * reconnect. If they return within the window, the pending exit is
 * cancelled and the room is unaffected. If the window elapses, we
 * commit the leave — RoomService then runs the usual
 * promotion-or-close flow (handleHostLeaving).
 *
 * Non-host disconnects are handled normally (immediate leave) by the
 * caller — this coordinator only intercepts the host case.
 *
 * Concurrency: state is per-user (one user has at most one pending exit
 * at a time). Multi-tab safety: the call site checks
 * `fetchSockets().length === 0` BEFORE invoking this coordinator, so by
 * the time we schedule a timer the user really has no remaining
 * connections.
 */
export class HostReconnectCoordinator {
  private readonly pending = new Map<string, PendingHostExit>();

  constructor(
    private readonly rooms: IRoomRepository,
    private readonly roomService: RoomService,
    private readonly graceMs: number,
  ) {}

  /**
   * Called from the disconnect handler when the user has no remaining
   * sockets. Returns:
   *   - true  if the disconnect was intercepted (host case, scheduled),
   *           in which case the caller MUST NOT also call leaveRoom.
   *   - false otherwise (non-host) — caller proceeds with the normal
   *           leave flow.
   */
  async onLastSocketDisconnect(
    user: AuthenticatedUser,
    roomId: string,
  ): Promise<boolean> {
    const room = await this.rooms.findById(roomId);
    if (!room || room.hostId !== user.id) return false;

    // Already scheduled? Refresh the timer rather than stacking.
    this.cancel(user.id);

    const handle = setTimeout(() => {
      void this.commitLeave(user, roomId);
    }, this.graceMs);

    this.pending.set(user.id, { roomId, user, timeoutHandle: handle });
    // eslint-disable-next-line no-console
    console.log(
      `[host-reconnect] grace started user=${user.id} room=${roomId} ms=${this.graceMs}`,
    );
    return true;
  }

  /**
   * Called from the connect handler. If this user had a pending host
   * exit, cancel it — they came back in time.
   */
  onReconnect(userId: string): void {
    const p = this.pending.get(userId);
    if (!p) return;
    clearTimeout(p.timeoutHandle);
    this.pending.delete(userId);
    // eslint-disable-next-line no-console
    console.log(`[host-reconnect] cancelled (host returned) user=${userId} room=${p.roomId}`);
  }

  private cancel(userId: string): void {
    const p = this.pending.get(userId);
    if (p) {
      clearTimeout(p.timeoutHandle);
      this.pending.delete(userId);
    }
  }

  private async commitLeave(user: AuthenticatedUser, roomId: string): Promise<void> {
    this.pending.delete(user.id);
    try {
      // The host membership might already have been closed (e.g. via
      // admin action) — leaveRoom throws NotAMemberError in that case
      // and we swallow it.
      await this.roomService.leaveRoom(user, roomId);
      // eslint-disable-next-line no-console
      console.log(`[host-reconnect] grace expired — promoted/closed room=${roomId}`);
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn(`[host-reconnect] commit leave failed user=${user.id} room=${roomId}:`, err);
    }
  }
}
