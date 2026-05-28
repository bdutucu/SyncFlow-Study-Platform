import { Socket } from 'socket.io';
import { RoomService } from './room.service';
import { roomChannel } from './room.events';
import { TimerService } from '../timer/timer.service';
import { MediaService } from '../media/media.service';
import { ChatService } from '../chat/chat.service';

/**
 * Per-socket handlers for the rooms module. Registered from the central
 * connection handler in server.ts.
 *
 * Wire protocol (acks use the standard Socket.IO callback convention):
 *
 *   socket.emit('room:subscribe', roomId, (res) => { ... });
 *     // res.ok === true on success
 *     // res.ok === false, res.error in { 'UNAUTHENTICATED' |
 *     //                                  'NOT_A_MEMBER' |
 *     //                                  'BAD_REQUEST' }
 *
 *   socket.emit('room:unsubscribe', roomId, (res) => { ... });
 *
 * Subscribing only opens the listening channel — the persistent membership
 * must already exist (created via POST /api/rooms/:id/join). This is the
 * two-step model documented in the README: REST owns persistence, sockets
 * own live presence.
 */

type Ack = (res: { ok: boolean; error?: string }) => void;
type ResyncAck = (res: {
  ok: boolean;
  error?: string;
  timer?: unknown;
  media?: unknown;
  messages?: unknown;
}) => void;

export function registerRoomSocketHandlers(
  socket: Socket,
  service: RoomService,
  timerService?: TimerService,
  mediaService?: MediaService,
  chatService?: ChatService,
): void {
  socket.on('room:subscribe', async (roomId: unknown, ack?: Ack) => {
    try {
      if (typeof roomId !== 'string' || roomId.length === 0) {
        return ack?.({ ok: false, error: 'BAD_REQUEST' });
      }
      const user = socket.data.user;
      if (!user) return ack?.({ ok: false, error: 'UNAUTHENTICATED' });

      const isMember = await service.isActiveMember(user.id, roomId);
      if (!isMember) return ack?.({ ok: false, error: 'NOT_A_MEMBER' });

      await socket.join(roomChannel(roomId));
      ack?.({ ok: true });
    } catch {
      ack?.({ ok: false, error: 'SERVER_ERROR' });
    }
  });

  socket.on('room:unsubscribe', async (roomId: unknown, ack?: Ack) => {
    if (typeof roomId !== 'string' || roomId.length === 0) {
      return ack?.({ ok: false, error: 'BAD_REQUEST' });
    }
    await socket.leave(roomChannel(roomId));
    ack?.({ ok: true });
  });

  /**
   * room:resync — DSD §3.5.7 state recovery on reconnect.
   *
   * Returns the live TimerState, current MediaState, and the most recent
   * chat messages so a returning client can hydrate without round-tripping
   * three separate REST calls.
   *
   * Wire:  socket.emit('room:resync', { roomId, chatLimit? }, ack)
   */
  socket.on('room:resync', async (payload: unknown, ack?: ResyncAck) => {
    try {
      const user = socket.data.user;
      if (!user) return ack?.({ ok: false, error: 'UNAUTHENTICATED' });

      const body = (payload ?? {}) as { roomId?: unknown; chatLimit?: unknown };
      if (typeof body.roomId !== 'string' || body.roomId.length === 0) {
        return ack?.({ ok: false, error: 'BAD_REQUEST' });
      }
      const roomId = body.roomId;
      const chatLimit =
        typeof body.chatLimit === 'number' && body.chatLimit > 0 && body.chatLimit <= 200
          ? body.chatLimit
          : 50;

      const isMember = await service.isActiveMember(user.id, roomId);
      if (!isMember && user.role !== 'SYSTEM_ADMIN') {
        return ack?.({ ok: false, error: 'NOT_A_MEMBER' });
      }

      const [timer, media, page] = await Promise.all([
        timerService ? timerService.getState(user, roomId).catch(() => undefined) : Promise.resolve(undefined),
        mediaService ? mediaService.getState(user, roomId).catch(() => undefined) : Promise.resolve(undefined),
        chatService
          ? chatService.listMessages(user, roomId, { limit: chatLimit }).catch(() => undefined)
          : Promise.resolve(undefined),
      ]);

      ack?.({
        ok: true,
        timer,
        media,
        messages: page?.messages,
      });
    } catch {
      ack?.({ ok: false, error: 'SERVER_ERROR' });
    }
  });
}
