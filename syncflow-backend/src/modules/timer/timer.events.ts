import { Server as IOServer } from 'socket.io';
import { TimerState } from './timer.types';
import { roomChannel } from '../rooms/room.events';

/**
 * ITimerEventPublisher — fan-out for state transitions. Subscribers are
 * the same Socket.IO room channel used by the rooms module
 * (`room:${roomId}`), so a single client subscription covers both
 * presence and timer events.
 *
 * Events:
 *   • timer:state_changed   — every transition: start, pause, resume,
 *                             reset, configure, skip, auto-advance.
 *   • timer:phase_completed — emitted just before a natural transition
 *                             so clients can play a sound / show a toast
 *                             distinct from a host-driven change.
 */
export interface ITimerEventPublisher {
  stateChanged(state: TimerState): void;
  phaseCompleted(roomId: string, completedPhase: TimerState['phase']): void;
}

export class SocketTimerEventPublisher implements ITimerEventPublisher {
  constructor(private readonly io: IOServer) {}

  stateChanged(state: TimerState): void {
    this.io.to(roomChannel(state.roomId)).emit('timer:state_changed', { state });
  }

  phaseCompleted(roomId: string, completedPhase: TimerState['phase']): void {
    this.io
      .to(roomChannel(roomId))
      .emit('timer:phase_completed', { roomId, completedPhase });
  }
}

/** Recording publisher for unit tests. */
export class RecordingTimerEventPublisher implements ITimerEventPublisher {
  events: Array<{ type: string; payload: Record<string, unknown> }> = [];
  stateChanged(state: TimerState) {
    this.events.push({ type: 'state_changed', payload: { state } });
  }
  phaseCompleted(roomId: string, completedPhase: TimerState['phase']) {
    this.events.push({ type: 'phase_completed', payload: { roomId, completedPhase } });
  }
}
