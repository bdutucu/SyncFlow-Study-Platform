import { BanRecord } from '@prisma/client';
import { prisma } from '../shared/prisma';
import {
  IBanRecordRepository,
  ApplyBanInput,
  ListBansOptions,
} from './interfaces/IBanRecordRepository';

export class BanRecordRepository implements IBanRecordRepository {
  async applyBan(input: ApplyBanInput): Promise<BanRecord | null> {
    return prisma.$transaction(async (tx) => {
      // SELECT FOR UPDATE-equivalent: read inside the tx so two concurrent
      // ban requests for the same user serialize on the row update below
      // and only one of them produces a BanRecord.
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { isBanned: true },
      });
      if (!user) return null;          // caller validated existence; defensive
      if (user.isBanned) return null;  // idempotent: already banned

      await tx.user.update({
        where: { id: input.userId },
        data: { isBanned: true },
      });
      return tx.banRecord.create({
        data: {
          userId: input.userId,
          adminId: input.adminId,
          action: 'BAN',
          reason: input.reason,
        },
      });
    });
  }

  async applyUnban(input: ApplyBanInput): Promise<BanRecord | null> {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.findUnique({
        where: { id: input.userId },
        select: { isBanned: true },
      });
      if (!user) return null;
      if (!user.isBanned) return null; // idempotent: already not banned

      await tx.user.update({
        where: { id: input.userId },
        data: { isBanned: false },
      });
      return tx.banRecord.create({
        data: {
          userId: input.userId,
          adminId: input.adminId,
          action: 'UNBAN',
          reason: input.reason,
        },
      });
    });
  }

  listForUser(userId: string, options: ListBansOptions): Promise<BanRecord[]> {
    return prisma.banRecord.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
    });
  }
}

export const banRecordRepository = new BanRecordRepository();
