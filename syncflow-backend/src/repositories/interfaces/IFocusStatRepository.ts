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
}
