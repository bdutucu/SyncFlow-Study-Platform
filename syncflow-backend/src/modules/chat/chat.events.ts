import { Server as IOServer } from 'socket.io';
import { ChatMessageDTO } from './chat.types';
import { roomChannel } from '../rooms/room.events';

/**
 * IChatEventPublisher — fan-out for chat events. Broadcasts go to the
 * same `room:${roomId}` channel used by the rooms and timer modules,
 * so a single socket subscription receives all room-scoped traffic.
 *
 * Wire events:
 *   • chat:new_message       — { message: ChatMessageDTO }
 *   • chat:message_deleted   — { roomId, messageId, deletedByUserId }
 *
 * Note on sender echo: the sender does receive the broadcast (they're
 * subscribed to the channel). The ack to `chat:send_message` ALSO
 * carries the persisted DTO. Clients reconcile by message id — this is
 * the standard pattern for optimistic UIs.
 */
export interface IChatEventPublisher {
  newMessage(roomId: string, message: ChatMessageDTO): void;
  messageDeleted(roomId: string, messageId: string, deletedByUserId: string): void;
}

export class SocketChatEventPublisher implements IChatEventPublisher {
  constructor(private readonly io: IOServer) {}

  newMessage(roomId: string, message: ChatMessageDTO): void {
    this.io.to(roomChannel(roomId)).emit('chat:new_message', { message });
  }

  messageDeleted(roomId: string, messageId: string, deletedByUserId: string): void {
    this.io
      .to(roomChannel(roomId))
      .emit('chat:message_deleted', { roomId, messageId, deletedByUserId });
  }
}

/** Recording publisher used in unit tests. */
export class RecordingChatEventPublisher implements IChatEventPublisher {
  events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  newMessage(roomId: string, message: ChatMessageDTO) {
    this.events.push({ type: 'new_message', payload: { roomId, message } });
  }
  messageDeleted(roomId: string, messageId: string, deletedByUserId: string) {
    this.events.push({
      type: 'message_deleted',
      payload: { roomId, messageId, deletedByUserId },
    });
  }
}
