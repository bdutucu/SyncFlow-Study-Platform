import { FocusStat } from '@prisma/client';
import { prisma } from '../shared/prisma';
import {
  IFocusStatRepository,
  CreateFocusStatInput,
  UserFocusTotals,
  DailyFocusBucket,
  LeaderboardRow,
  LeaderboardPeriod,
} from './interfaces/IFocusStatRepository';

export class FocusStatRepository implements IFocusStatRepository {
  async createMany(rows: CreateFocusStatInput[]): Promise<number> {
    if (rows.length === 0) return 0;
    const result = await prisma.focusStat.createMany({
      data: rows,
      // Prisma's createMany on PostgreSQL is one INSERT — no per-row overhead.
    });
    return result.count;
  }

  listByUser(userId: string, limit = 50): Promise<FocusStat[]> {
    return prisma.focusStat.findMany({
      where: { userId },
      orderBy: { endedAt: 'desc' },
      take: limit,
    });
  }

  async totalsForUser(userId: string): Promise<UserFocusTotals> {
    const result = await prisma.focusStat.aggregate({
      where: { userId, phase: 'WORK' },
      _sum: { durationMs: true },
      _count: { _all: true },
    });
    return {
      userId,
      totalFocusMs: result._sum.durationMs ?? 0,
      completedWorkSessions: result._count._all,
    };
  }

  async dailyBreakdownForUser(
    userId: string,
    days: number,
  ): Promise<DailyFocusBucket[]> {
    // We compute the window in UTC so the boundary stays stable across
    // daylight-saving transitions. The dashboard renders day labels using
    // the client's locale, so this is purely a server-side bucket key.
    const now = new Date();
    const start = new Date(Date.UTC(
      now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - (days - 1),
    ));

    // Single grouped query — Prisma's aggregate is not date-bucketed, so
    // we pull the raw rows and reduce in JS. At our scale (hundreds of
    // rows per user even after months of usage) this is cheaper than
    // shipping a raw-SQL date_trunc.
    const rows = await prisma.focusStat.findMany({
      where: {
        userId,
        phase: 'WORK',
        endedAt: { gte: start },
      },
      select: { durationMs: true, endedAt: true },
    });

    const buckets = new Map<string, DailyFocusBucket>();
    for (let i = 0; i < days; i++) {
      const d = new Date(Date.UTC(
        start.getUTCFullYear(), start.getUTCMonth(), start.getUTCDate() + i,
      ));
      const key = d.toISOString().slice(0, 10);
      buckets.set(key, { date: key, focusMs: 0, sessions: 0 });
    }
    for (const r of rows) {
      const key = r.endedAt.toISOString().slice(0, 10);
      const b = buckets.get(key);
      if (b) {
        b.focusMs += r.durationMs;
        b.sessions += 1;
      }
    }
    return Array.from(buckets.values());
  }

  async leaderboard(
    period: LeaderboardPeriod,
    limit: number,
  ): Promise<LeaderboardRow[]> {
    const where: { phase: 'WORK'; endedAt?: { gte: Date } } = { phase: 'WORK' };
    if (period !== 'all') {
      const days = period === 'week' ? 7 : 30;
      const now = new Date();
      const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
      where.endedAt = { gte: since };
    }

    const grouped = await prisma.focusStat.groupBy({
      by: ['userId'],
      where,
      _sum: { durationMs: true },
      _count: { _all: true },
      orderBy: { _sum: { durationMs: 'desc' } },
      take: limit,
    });

    return grouped.map((row) => ({
      userId: row.userId,
      totalFocusMs: row._sum.durationMs ?? 0,
      sessions: row._count._all,
    }));
  }
}

export const focusStatRepository = new FocusStatRepository();
