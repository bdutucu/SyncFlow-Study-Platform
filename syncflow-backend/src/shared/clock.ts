/**
 * Clock — a tiny indirection around the current time so time-dependent
 * services (Pomodoro Sync Engine, future cooldowns, rate limiting, ...)
 * remain unit-testable without Jest fake timers leaking across the test
 * file.
 */
export interface Clock {
  /** Milliseconds since the Unix epoch. */
  now(): number;
}

export const systemClock: Clock = {
  now: () => Date.now(),
};
