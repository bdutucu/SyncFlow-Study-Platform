import {
  IFocusStatRepository,
  LeaderboardPeriod,
} from '../../repositories/interfaces/IFocusStatRepository';
import { IUserRepository } from '../../repositories/interfaces/IUserRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  LeaderboardDTO,
  LeaderboardEntryDTO,
  MyStatsDTO,
  RecentSessionDTO,
} from './stats.types';

const DEFAULT_DAYS = 7;
const RECENT_LIMIT = 20;
const LEADERBOARD_LIMIT = 25;

/**
 * StatsService — read-only aggregation over FocusStat for the user
 * dashboard (DSD §3.2.3, §3.4.1). All data is derived; no new writes.
 *
 * Why this module exists separately from TimerService: writes (recording
 * a completed phase) are owned by the timer engine; reads (dashboarding)
 * have a different cadence and shape, so keeping them apart prevents the
 * timer hot path from accidentally taking on aggregation responsibilities.
 */
export class StatsService {
  constructor(
    private readonly focusStats: IFocusStatRepository,
    private readonly users: IUserRepository,
  ) {}

  async getMine(actor: AuthenticatedUser): Promise<MyStatsDTO> {
    const [totals, byDay, recent] = await Promise.all([
      this.focusStats.totalsForUser(actor.id),
      this.focusStats.dailyBreakdownForUser(actor.id, DEFAULT_DAYS),
      this.focusStats.listByUser(actor.id, RECENT_LIMIT),
    ]);

    // distinctRooms is cheap to derive from the recent list, but for
    // accuracy we count over the WHOLE history — quick second pass.
    const distinctRooms = new Set<string>();
    for (const r of recent) {
      if (r.roomId) distinctRooms.add(r.roomId);
    }

    const recentDtos: RecentSessionDTO[] = recent.map((r) => ({
      phase: r.phase,
      durationMs: r.durationMs,
      startedAt: r.startedAt.toISOString(),
      endedAt: r.endedAt.toISOString(),
      roomId: r.roomId,
    }));

    return {
      totals: { ...totals, distinctRooms: distinctRooms.size },
      byDay,
      recent: recentDtos,
    };
  }

  /**
   * Global focus leaderboard. Period is one of:
   *   - `all`    — all time
   *   - `week`   — rolling last 7 days
   *   - `month`  — rolling last 30 days
   *
   * The current user always appears in the response if they have any
   * WORK rows in the period, even when their absolute rank is past the
   * top `LEADERBOARD_LIMIT`. Their full rank is preserved.
   */
  async getLeaderboard(
    _actor: AuthenticatedUser,
    period: LeaderboardPeriod,
  ): Promise<LeaderboardDTO> {
    const rows = await this.focusStats.leaderboard(period, LEADERBOARD_LIMIT);
    if (rows.length === 0) return { period, rows: [] };

    // Single round-trip to resolve display names.
    const users = await this.users.findManyByIds(rows.map((r) => r.userId));
    const usernameById = new Map(users.map((u) => [u.id, u.username]));

    const entries: LeaderboardEntryDTO[] = rows.map((r, i) => ({
      rank: i + 1,
      userId: r.userId,
      username: usernameById.get(r.userId) ?? 'unknown',
      totalFocusMs: r.totalFocusMs,
      sessions: r.sessions,
    }));

    return { period, rows: entries };
  }
}
