import { TimerPhase } from '@prisma/client';

export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

/**
 * TimerConfig — per-room Pomodoro configuration. Defaults follow the
 * classic Pomodoro Technique (25 / 5 / 15, long break every 4th work).
 */
export interface TimerConfig {
  workDurationMs: number;
  shortBreakDurationMs: number;
  longBreakDurationMs: number;
  cyclesBeforeLongBreak: number;
  autoAdvance: boolean;
}

export const DEFAULT_TIMER_CONFIG: TimerConfig = {
  workDurationMs: 25 * 60 * 1000,
  shortBreakDurationMs: 5 * 60 * 1000,
  longBreakDurationMs: 15 * 60 * 1000,
  cyclesBeforeLongBreak: 4,
  autoAdvance: true,
};

/**
 * TimerState — the canonical, server-authoritative state for one room's
 * timer. Lives in memory (DSD §3.2.3 calls for low-latency synchronization;
 * timer state is recoverable from the wall clock).
 *
 * Time accounting (so clients can render without per-second server ticks):
 *   - phaseStartedAt: epoch-ms when the CURRENT run of the current phase
 *     began. null when status != RUNNING.
 *   - pausedAt: epoch-ms when PAUSE was issued (null if not paused).
 *   - accumulatedMs: elapsed time in the current phase from previous runs
 *     (i.e. before the most recent pause). Reset on phase change.
 *
 * Client-side computation:
 *   if status == RUNNING:  elapsed = accumulatedMs + (Date.now() - phaseStartedAt)
 *   if status == PAUSED:   elapsed = accumulatedMs
 *   if status == IDLE:     elapsed = 0
 *   remaining = phaseDurationMs - elapsed
 */
export interface TimerState {
  roomId: string;
  status: TimerStatus;
  phase: TimerPhase;
  phaseStartedAt: number | null;
  pausedAt: number | null;
  accumulatedMs: number;
  /** Convenience: duration of the current phase, derived from config + phase. */
  phaseDurationMs: number;
  /** Number of WORK phases completed since the last LONG_BREAK. */
  completedWorkCycles: number;
  config: TimerConfig;
}

/** Wire shape: identical to TimerState, just labelled for the API doc. */
export type TimerStateDTO = TimerState;
