/**
 * ITimerScheduler — schedules a callback to fire when the current phase
 * is expected to expire. The callback fires at most once per schedule()
 * call; calling schedule() again replaces any pending fire for that room.
 *
 * This is the seam at which tests use a manual scheduler (see
 * timer.service.test.ts) to trigger expiration deterministically, while
 * production uses NodeTimerScheduler which is just setTimeout under
 * the hood.
 */
export interface ITimerScheduler {
  scheduleExpiration(roomId: string, delayMs: number, onExpire: () => void): void;
  cancelExpiration(roomId: string): void;
}

export class NodeTimerScheduler implements ITimerScheduler {
  private timers = new Map<string, NodeJS.Timeout>();

  scheduleExpiration(roomId: string, delayMs: number, onExpire: () => void): void {
    this.cancelExpiration(roomId);
    // Clamp negative/zero to a tiny positive so setTimeout still fires on
    // the next tick rather than synchronously (consistent ordering).
    const delay = Math.max(1, delayMs);
    const handle = setTimeout(() => {
      this.timers.delete(roomId);
      try {
        onExpire();
      } catch (err) {
        // eslint-disable-next-line no-console
        console.error(`[timer] expiration handler threw for room ${roomId}:`, err);
      }
    }, delay);
    this.timers.set(roomId, handle);
  }

  cancelExpiration(roomId: string): void {
    const handle = this.timers.get(roomId);
    if (handle) {
      clearTimeout(handle);
      this.timers.delete(roomId);
    }
  }
}
