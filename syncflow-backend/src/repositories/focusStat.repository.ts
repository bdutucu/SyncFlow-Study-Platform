import { FocusStat } from '@prisma/client';
import { prisma } from '../shared/prisma';
import {
  IFocusStatRepository,
  CreateFocusStatInput,
  UserFocusTotals,
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
}

export const focusStatRepository = new FocusStatRepository();
