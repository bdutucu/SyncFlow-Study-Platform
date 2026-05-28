import { BanRecord } from '@prisma/client';

export interface ApplyBanInput {
  userId: string;
  adminId: string;
  reason: string | null;
}

export interface ListBansOptions {
  /** Limit returned rows (caller may cap). */
  limit: number;
}

/**
 * IBanRecordRepository — persistence surface for moderation history
 * (DSD §3.2.6, §3.4.1).
 *
 * applyBan and applyUnban are transactional cross-cutting operations:
 * they atomically toggle `User.isBanned` AND write the corresponding
 * `BanRecord` row, so the live ban state and the audit trail can never
 * disagree.
 *
 * Both methods return:
 *   - the new BanRecord on a state change (was-not-banned → banned, or
 *     was-banned → not-banned), OR
 *   - null when the call would be a no-op (the user was already in the
 *     requested state). This makes the service-level idempotency check
 *     cheap and race-free.
 */
export interface IBanRecordRepository {
  applyBan(input: ApplyBanInput): Promise<BanRecord | null>;
  applyUnban(input: ApplyBanInput): Promise<BanRecord | null>;
  listForUser(userId: string, options: ListBansOptions): Promise<BanRecord[]>;
}
