import { TimerState, TimerConfig, DEFAULT_TIMER_CONFIG } from './timer.types';

/**
 * ITimerStore — keyed by roomId. Returns null for rooms that have never
 * been touched; callers should use getOrInit() to create-on-demand.
 *
 * Production impl is in-memory. The store survives only as long as the
 * Node process: on restart, all timers reset to IDLE. This is an
 * intentional simplification (DSD §3.2.3 — timer state is ephemeral and
 * recoverable from the wall clock; FocusStats are the durable artefact).
 * A Redis-backed implementation could be dropped in behind this interface
 * if horizontal scaling is needed later.
 */
export interface ITimerStore {
  get(roomId: string): TimerState | null;
  getOrInit(roomId: string): TimerState;
  set(state: TimerState): void;
  delete(roomId: string): void;
}

export class InMemoryTimerStore implements ITimerStore {
  private states = new Map<string, TimerState>();

  get(roomId: string): TimerState | null {
    return this.states.get(roomId) ?? null;
  }

  getOrInit(roomId: string): TimerState {
    const existing = this.states.get(roomId);
    if (existing) return existing;
    const fresh = initialState(roomId, DEFAULT_TIMER_CONFIG);
    this.states.set(roomId, fresh);
    return fresh;
  }

  set(state: TimerState): void {
    this.states.set(state.roomId, state);
  }

  delete(roomId: string): void {
    this.states.delete(roomId);
  }
}

/** Build an IDLE state in the WORK phase with the given config. */
export function initialState(roomId: string, config: TimerConfig): TimerState {
  return {
    roomId,
    status: 'IDLE',
    phase: 'WORK',
    phaseStartedAt: null,
    pausedAt: null,
    accumulatedMs: 0,
    phaseDurationMs: config.workDurationMs,
    completedWorkCycles: 0,
    config,
  };
}

export const inMemoryTimerStore = new InMemoryTimerStore();
