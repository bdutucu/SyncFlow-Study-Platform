import { FocusStat, TimerPhase } from '@prisma/client';

export interface CreateFocusStatInput {
  userId: string;
  roomId: string | null;
  phase: TimerPhase;
  durationMs: number;
  startedAt: Date;
  endedAt: Date;
}

export interface UserFocusTotals {
  userId: string;
  totalFocusMs: number;
  completedWorkSessions: number;
}

/** One day's WORK aggregate for a chart. ISO date (yyyy-mm-dd, UTC). */
export interface DailyFocusBucket {
  date: string;
  focusMs: number;
  sessions: number;
}

/** One row in the focus leaderboard. */
export interface LeaderboardRow {
  userId: string;
  totalFocusMs: number;
  sessions: number;
}

export type LeaderboardPeriod = 'all' | 'week' | 'month';

/**
 * IFocusStatRepository — persistence surface for completed phase records
 * (DSD §3.2.3, §3.4.1).
 *
 * createMany is used because every natural end-of-WORK transition writes
 * one row per active member of the room, so we want a single round-trip.
 */
export interface IFocusStatRepository {
  createMany(rows: CreateFocusStatInput[]): Promise<number>;
  listByUser(userId: string, limit?: number): Promise<FocusStat[]>;
  totalsForUser(userId: string): Promise<UserFocusTotals>;
  /**
   * WORK-only daily aggregate ending today, used for the dashboard
   * chart. Days with no activity ARE included with zero totals so the
   * client can render an even bar grid without padding logic.
   */
  dailyBreakdownForUser(userId: string, days: number): Promise<DailyFocusBucket[]>;
  /**
   * Top N users by total WORK time within the period. `all` is unbounded;
   * `week`/`month` use rolling windows (last 7 / 30 days, UTC).
   * Users with zero WORK rows are omitted.
   */
  leaderboard(
    period: LeaderboardPeriod,
    limit: number,
  ): Promise<LeaderboardRow[]>;
}
