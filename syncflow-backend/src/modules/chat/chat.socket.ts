import { Socket } from 'socket.io';
import { ChatService } from './chat.service';
import { sendMessageSchema } from './chat.validators';
import { HttpError } from '../../shared/http-error';

/**
 * Per-socket handler for `chat:send_message`.
 *
 * Wire protocol:
 *
 *   socket.emit(
 *     'chat:send_message',
 *     { roomId: '...', content: '...' },
 *     (res) => { ... }
 *   );
 *
 *   res.ok === true,  res.message === persisted ChatMessageDTO
 *   res.ok === false, res.error === code (e.g. 'CHAT_NOT_MEMBER',
 *                                              'VALIDATION', 'UNAUTHENTICATED')
 *
 * Why socket and not REST: every send must propagate to the whole room
 * with minimum latency. Routing the message through REST would add a
 * second hop (HTTP -> websocket broadcast). Server still authorizes,
 * validates, and persists exactly as a REST handler would.
 *
 * The broadcast goes to ALL subscribers of `room:${roomId}`, including
 * the sender. Clients reconcile the ack and the broadcast by message
 * id — the standard pattern for chat with optimistic UIs.
 */

type Ack = (res: {
  ok: boolean;
  message?: unknown;
  error?: string;
}) => void;

function fail(ack: Ack | undefined, err: unknown): void {
  if (!ack) return;
  if (err instanceof HttpError) {
    ack({ ok: false, error: err.code ?? err.message });
  } else {
    ack({ ok: false, error: 'SERVER_ERROR' });
  }
}

export function registerChatSocketHandlers(
  socket: Socket,
  service: ChatService,
): void {
  socket.on('chat:send_message', async (payload: unknown, ack?: Ack) => {
    try {
      const user = socket.data.user;
      if (!user) return fail(ack, new Error('UNAUTHENTICATED'));

      const parsed = sendMessageSchema.safeParse(payload);
      if (!parsed.success) return ack?.({ ok: false, error: 'VALIDATION' });

      const message = await service.sendMessage(
        user,
        parsed.data.roomId,
        parsed.data.content,
      );
      ack?.({ ok: true, message });
    } catch (err) {
      fail(ack, err);
    }
  });
}
