import { Server as IOServer } from 'socket.io';
import { MediaState } from './media.types';
import { roomChannel } from '../rooms/room.events';

/**
 * IMediaEventPublisher — fan-out for media state transitions. Same
 * `room:${roomId}` channel as the rooms / timer / chat modules.
 *
 * Wire event:
 *   media:state_changed — { state: MediaState }
 *
 * Emitted on every load / play / pause / seek / unload, never as a
 * tick. Clients that just connected can call `media:get_state` to
 * fetch the current snapshot rather than waiting for the next change.
 */
export interface IMediaEventPublisher {
  stateChanged(state: MediaState): void;
}

export class SocketMediaEventPublisher implements IMediaEventPublisher {
  constructor(private readonly io: IOServer) {}

  stateChanged(state: MediaState): void {
    this.io.to(roomChannel(state.roomId)).emit('media:state_changed', { state });
  }
}

/** Recording publisher for unit tests. */
export class RecordingMediaEventPublisher implements IMediaEventPublisher {
  events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  stateChanged(state: MediaState) {
    this.events.push({ type: 'state_changed', payload: { state } });
  }
}
