import { TimerPhase } from '@prisma/client';
import { DailyFocusBucket, UserFocusTotals } from '../../repositories/interfaces/IFocusStatRepository';

/**
 * Wire shape returned by GET /api/stats/me.
 *
 * `byDay` is always `days` items long, oldest first, with zero buckets
 * filled in for idle days. `recent` is the last N completed phases
 * across any room, newest first — used to render a "history" list.
 */
export interface MyStatsDTO {
  totals: UserFocusTotals & {
    /** Distinct rooms the user has earned focus in (not in totals struct). */
    distinctRooms: number;
  };
  byDay: DailyFocusBucket[];
  recent: RecentSessionDTO[];
}

export interface RecentSessionDTO {
  phase: TimerPhase;
  durationMs: number;
  startedAt: string;
  endedAt: string;
  roomId: string | null;
}

/** A leaderboard row, after joining the username. */
export interface LeaderboardEntryDTO {
  rank: number;
  userId: string;
  username: string;
  totalFocusMs: number;
  sessions: number;
}

export interface LeaderboardDTO {
  period: 'all' | 'week' | 'month';
  rows: LeaderboardEntryDTO[];
}
