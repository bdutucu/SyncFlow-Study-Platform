import { TimerPhase } from '@prisma/client';
import { Clock } from '../../shared/clock';
import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import { IFocusStatRepository } from '../../repositories/interfaces/IFocusStatRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  TimerState,
  TimerStatus,
  TimerConfig,
  DEFAULT_TIMER_CONFIG,
} from './timer.types';
import { ITimerStore, initialState } from './timer.store';
import { ITimerScheduler } from './timer.scheduler';
import { ITimerEventPublisher } from './timer.events';
import { TimerConfigPatch } from './timer.validators';
import {
  TimerHostActionForbiddenError,
  TimerNotMemberError,
  TimerRoomNotFoundError,
  TimerInvalidStateError,
} from './timer.errors';

/**
 * TimerService — Pomodoro Sync Engine component (DSD §3.2.3).
 *
 * Design:
 *   • Server-authoritative: state lives in TimerStore. Every transition
 *     emits a single state_changed event with absolute timestamps so
 *     clients can render without per-second server ticks.
 *   • Host-only writes: start / pause / resume / reset / skip /
 *     configure require room.hostId === actor.id (SYSTEM_ADMIN may
 *     also act, consistent with the moderation rules in DSD §3.2.6).
 *   • Phase scheduling: each RUNNING phase has exactly one pending
 *     scheduler callback. Cancelled and re-scheduled on every
 *     transition. The callback is `onPhaseExpired`, which handles
 *     auto-advance and FocusStat recording.
 *   • FocusStat: written only when a WORK phase ENDS NATURALLY
 *     (timer expired). Manual skip / reset / pause do not credit
 *     stats. One row per active member at the moment of completion.
 */
export class TimerService {
  constructor(
    private readonly rooms: IRoomRepository,
    private readonly focusStats: IFocusStatRepository,
    private readonly store: ITimerStore,
    private readonly scheduler: ITimerScheduler,
    private readonly publisher: ITimerEventPublisher,
    private readonly clock: Clock,
  ) {}

  // -------------------------------------------------------- public API ----

  async getState(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireMembership(actor, roomId);
    return this.store.getOrInit(roomId);
  }

  async start(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);

    if (state.status === 'RUNNING') {
      throw new TimerInvalidStateError('Timer is already running');
    }
    // From IDLE or PAUSED → RUNNING. accumulatedMs is preserved (PAUSED
    // case) or zero (IDLE case).
    const next: TimerState = {
      ...state,
      status: 'RUNNING',
      phaseStartedAt: this.clock.now(),
      pausedAt: null,
    };
    this.commit(next);
    this.scheduleEnd(next);
    return next;
  }

  async pause(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    if (state.status !== 'RUNNING') {
      throw new TimerInvalidStateError('Timer is not running');
    }
    const now = this.clock.now();
    const runMs = state.phaseStartedAt !== null ? now - state.phaseStartedAt : 0;
    const next: TimerState = {
      ...state,
      status: 'PAUSED',
      phaseStartedAt: null,
      pausedAt: now,
      accumulatedMs: state.accumulatedMs + runMs,
    };
    this.scheduler.cancelExpiration(roomId);
    this.commit(next);
    return next;
  }

  async resume(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    if (state.status !== 'PAUSED') {
      throw new TimerInvalidStateError('Timer is not paused');
    }
    const next: TimerState = {
      ...state,
      status: 'RUNNING',
      phaseStartedAt: this.clock.now(),
      pausedAt: null,
    };
    this.commit(next);
    this.scheduleEnd(next);
    return next;
  }

  /**
   * Reset returns to the current phase's IDLE state with elapsed=0.
   * Does NOT record a FocusStat (the user discarded the session).
   */
  async reset(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    const next: TimerState = {
      ...state,
      status: 'IDLE',
      phaseStartedAt: null,
      pausedAt: null,
      accumulatedMs: 0,
      phaseDurationMs: durationFor(state.phase, state.config),
    };
    this.scheduler.cancelExpiration(roomId);
    this.commit(next);
    return next;
  }

  /**
   * Skip ends the current phase WITHOUT recording a stat and advances
   * to the next phase in IDLE status (host must explicitly start).
   */
  async skip(actor: AuthenticatedUser, roomId: string): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    this.scheduler.cancelExpiration(roomId);
    const next = advanceToNextPhase(state, /* completedNaturally */ false);
    this.commit(next);
    this.publisher.phaseCompleted(roomId, state.phase);
    return next;
  }

  async configure(
    actor: AuthenticatedUser,
    roomId: string,
    patch: TimerConfigPatch,
  ): Promise<TimerState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);

    // Reconfiguring an IDLE timer is fine. While RUNNING / PAUSED we
    // accept the change but recompute the current phase's duration; if
    // the new duration is already in the past relative to elapsed, the
    // timer expires on the next tick.
    const newConfig: TimerConfig = { ...state.config, ...patch };
    const next: TimerState = {
      ...state,
      config: newConfig,
      phaseDurationMs: durationFor(state.phase, newConfig),
    };
    this.commit(next);
    if (next.status === 'RUNNING') {
      // Re-arm the scheduler with the recomputed remaining time.
      this.scheduleEnd(next);
    }
    return next;
  }

  /**
   * Called by the scheduler when the phase end-time arrives. Public so
   * tests can trigger it directly via a ManualTimerScheduler.
   *
   * Behaviour:
   *   1. If room no longer exists, drop state and bail.
   *   2. Record FocusStat for each active member iff the completed
   *      phase was WORK.
   *   3. Emit phase_completed.
   *   4. Advance to next phase. If config.autoAdvance, set RUNNING and
   *      arm the next scheduler firing; else set IDLE.
   *   5. Emit state_changed.
   */
  async onPhaseExpired(roomId: string): Promise<void> {
    const state = this.store.get(roomId);
    if (!state || state.status !== 'RUNNING') return;

    const room = await this.rooms.findById(roomId);
    if (!room) {
      this.store.delete(roomId);
      return;
    }

    const now = this.clock.now();
    const completedPhase = state.phase;

    if (completedPhase === 'WORK') {
      await this.recordFocusStats(state, now);
    }

    this.publisher.phaseCompleted(roomId, completedPhase);

    let next = advanceToNextPhase(state, /* completedNaturally */ true);

    if (next.config.autoAdvance) {
      next = {
        ...next,
        status: 'RUNNING',
        phaseStartedAt: now,
        pausedAt: null,
        accumulatedMs: 0,
      };
    }

    this.commit(next);
    if (next.status === 'RUNNING') this.scheduleEnd(next);
  }

  /** Called by RoomService cleanup hooks (wired in server.ts). */
  cleanupRoom(roomId: string): void {
    this.scheduler.cancelExpiration(roomId);
    this.store.delete(roomId);
  }

  // ------------------------------------------------------ private bits ----

  private commit(state: TimerState): void {
    this.store.set(state);
    this.publisher.stateChanged(state);
  }

  private scheduleEnd(state: TimerState): void {
    const elapsed =
      state.accumulatedMs +
      (state.phaseStartedAt !== null
        ? this.clock.now() - state.phaseStartedAt
        : 0);
    const remaining = state.phaseDurationMs - elapsed;
    this.scheduler.scheduleExpiration(state.roomId, remaining, () => {
      void this.onPhaseExpired(state.roomId);
    });
  }

  private async recordFocusStats(state: TimerState, endedAtMs: number): Promise<void> {
    const startedAt = new Date(endedAtMs - state.phaseDurationMs);
    const endedAt = new Date(endedAtMs);

    const members = await this.rooms.listActiveMembers(state.roomId);
    if (members.length === 0) return;

    await this.focusStats.createMany(
      members.map((m) => ({
        userId: m.userId,
        roomId: state.roomId,
        phase: state.phase,
        durationMs: state.phaseDurationMs,
        startedAt,
        endedAt,
      })),
    );
  }

  private async requireHost(actor: AuthenticatedUser, roomId: string): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new TimerRoomNotFoundError();
    const isAdmin = actor.role === 'SYSTEM_ADMIN';
    if (room.hostId !== actor.id && !isAdmin) {
      throw new TimerHostActionForbiddenError();
    }
  }

  private async requireMembership(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new TimerRoomNotFoundError();
    if (actor.role === 'SYSTEM_ADMIN' || room.hostId === actor.id) return;
    const m = await this.rooms.findMembership(actor.id, roomId);
    if (!m || m.status !== 'ACTIVE') throw new TimerNotMemberError();
  }
}

// ---------------------------------------------------- pure helpers ----

export function durationFor(phase: TimerPhase, config: TimerConfig): number {
  switch (phase) {
    case 'WORK':
      return config.workDurationMs;
    case 'SHORT_BREAK':
      return config.shortBreakDurationMs;
    case 'LONG_BREAK':
      return config.longBreakDurationMs;
  }
}

/**
 * Pure: compute the state of the next phase. Does NOT set status; the
 * caller decides RUNNING vs IDLE based on autoAdvance.
 *
 *   WORK         → completedWorkCycles++. If divisible by
 *                  cyclesBeforeLongBreak → LONG_BREAK, else SHORT_BREAK.
 *   SHORT_BREAK  → WORK.
 *   LONG_BREAK   → WORK; cycle counter resets to 0.
 *
 * `completedNaturally` tells us whether to bump completedWorkCycles
 * (true on natural end, false on host skip).
 */
export function advanceToNextPhase(
  state: TimerState,
  completedNaturally: boolean,
): TimerState {
  let nextPhase: TimerPhase;
  let cycles = state.completedWorkCycles;

  if (state.phase === 'WORK') {
    if (completedNaturally) cycles += 1;
    nextPhase =
      cycles > 0 && cycles % state.config.cyclesBeforeLongBreak === 0
        ? 'LONG_BREAK'
        : 'SHORT_BREAK';
  } else if (state.phase === 'SHORT_BREAK') {
    nextPhase = 'WORK';
  } else {
    nextPhase = 'WORK';
    cycles = 0; // long break ended; new cycle group begins
  }

  const status: TimerStatus = 'IDLE';
  return {
    ...state,
    phase: nextPhase,
    status,
    phaseStartedAt: null,
    pausedAt: null,
    accumulatedMs: 0,
    phaseDurationMs: durationFor(nextPhase, state.config),
    completedWorkCycles: cycles,
  };
}

/** Re-export so server.ts has one canonical builder. */
export { initialState, DEFAULT_TIMER_CONFIG };
