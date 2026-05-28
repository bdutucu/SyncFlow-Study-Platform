import { Server as IOServer } from 'socket.io';
import { MemberDTO, RoomSummary } from './room.types';

/**
 * Channel naming convention: every room owns a Socket.IO room named
 *   `room:${roomId}`
 * Subscribed clients (see room.socket.ts) receive presence + room-state
 * events for as long as they remain joined to that channel.
 */
export const roomChannel = (roomId: string): string => `room:${roomId}`;

/**
 * IRoomEventPublisher — what the service uses to fan out live events.
 * The interface lets RoomService run with a no-op or recording publisher
 * in unit tests, without booting Socket.IO.
 */
export interface IRoomEventPublisher {
  userJoined(roomId: string, member: MemberDTO): void;
  userLeft(roomId: string, userId: string): void;
  userKicked(roomId: string, userId: string): void;
  roomUpdated(roomId: string, room: RoomSummary): void;
  roomDeleted(roomId: string): void;
  hostChanged(roomId: string, newHostId: string, oldHostId: string): void;
}

/** Socket.IO-backed implementation, wired in the composition root. */
export class SocketRoomEventPublisher implements IRoomEventPublisher {
  constructor(private readonly io: IOServer) {}

  userJoined(roomId: string, member: MemberDTO): void {
    this.io.to(roomChannel(roomId)).emit('room:user_joined', { roomId, member });
  }

  userLeft(roomId: string, userId: string): void {
    this.io.to(roomChannel(roomId)).emit('room:user_left', { roomId, userId });
  }

  userKicked(roomId: string, userId: string): void {
    this.io.to(roomChannel(roomId)).emit('room:user_kicked', { roomId, userId });
  }

  roomUpdated(roomId: string, room: RoomSummary): void {
    this.io.to(roomChannel(roomId)).emit('room:room_updated', { room });
  }

  roomDeleted(roomId: string): void {
    // Notify subscribers, then disconnect them from the channel so they
    // don't keep a dangling subscription.
    this.io.to(roomChannel(roomId)).emit('room:room_deleted', { roomId });
    this.io.socketsLeave(roomChannel(roomId));
  }

  hostChanged(roomId: string, newHostId: string, oldHostId: string): void {
    this.io
      .to(roomChannel(roomId))
      .emit('room:host_changed', { roomId, newHostId, oldHostId });
  }
}

/** Recording publisher (no Socket.IO needed) — useful for unit tests. */
export class RecordingRoomEventPublisher implements IRoomEventPublisher {
  events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  userJoined(roomId: string, member: MemberDTO) {
    this.events.push({ type: 'user_joined', payload: { roomId, member } });
  }
  userLeft(roomId: string, userId: string) {
    this.events.push({ type: 'user_left', payload: { roomId, userId } });
  }
  userKicked(roomId: string, userId: string) {
    this.events.push({ type: 'user_kicked', payload: { roomId, userId } });
  }
  roomUpdated(roomId: string, room: RoomSummary) {
    this.events.push({ type: 'room_updated', payload: { roomId, room } });
  }
  roomDeleted(roomId: string) {
    this.events.push({ type: 'room_deleted', payload: { roomId } });
  }
  hostChanged(roomId: string, newHostId: string, oldHostId: string) {
    this.events.push({ type: 'host_changed', payload: { roomId, newHostId, oldHostId } });
  }
}
