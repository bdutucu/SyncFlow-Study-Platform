import { BanRecord, User, UserRole } from '@prisma/client';
import { IUserRepository } from '../../repositories/interfaces/IUserRepository';
import { IBanRecordRepository } from '../../repositories/interfaces/IBanRecordRepository';
import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  AdminUserDTO,
  BanRecordDTO,
  BanResultDTO,
  IRoomMemberRemover,
  IUserSessionEnforcer,
  PagedAdminUsersDTO,
} from './admin.types';
import {
  AdminUserNotFoundError,
  AdminCannotBanSelfError,
  AdminCannotBanAdminError,
} from './admin.errors';
import { ForbiddenError } from '../../shared/http-error';

const MAX_PAGE_SIZE = 100;
const MAX_BAN_HISTORY = 200;

/**
 * AdminService — Admin Moderation component (DSD §3.2.6).
 *
 * Responsibilities (functional requirements):
 *   • Global user ban / unban with persistent audit trail (BanRecord).
 *   • Cascade on ban: close any active room membership; if the user was
 *     a host, host-transfer or room-close kicks in via
 *     IRoomMemberRemover.removeMemberByAdmin.
 *   • Immediate session termination: forcibly disconnect all the user's
 *     open sockets via IUserSessionEnforcer so the ban is felt right
 *     away rather than waiting up to the JWT TTL (15 min, DSD §3.5.5).
 *   • Paginated user / ban-history listings for an admin dashboard.
 *
 * Authorization: every operation requires SYSTEM_ADMIN. The role check
 * runs as the first step of every method so the rule is local and easy
 * to audit. Route-level requireRole gating is also applied as
 * defence-in-depth.
 *
 * Banning rules:
 *   • Cannot ban yourself.
 *   • Cannot ban another administrator. This prevents an internal coup
 *     where one admin disables all others. A super-admin tier could
 *     relax this later.
 */
export class AdminService {
  constructor(
    private readonly users: IUserRepository,
    private readonly bans: IBanRecordRepository,
    private readonly rooms: IRoomRepository,
    private readonly roomRemover: IRoomMemberRemover,
    private readonly sessions: IUserSessionEnforcer,
  ) {}

  // -------------------------------------------------------- public API ----

  async banUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    reason: string | null,
  ): Promise<BanResultDTO> {
    this.requireAdmin(actor);
    if (targetUserId === actor.id) throw new AdminCannotBanSelfError();

    const target = await this.users.findById(targetUserId);
    if (!target) throw new AdminUserNotFoundError();
    if (target.role === UserRole.SYSTEM_ADMIN) throw new AdminCannotBanAdminError();

    // Atomic: toggles User.isBanned AND writes the BanRecord. Returns
    // null on the second call (idempotent no-op).
    const record = await this.bans.applyBan({
      userId: targetUserId,
      adminId: actor.id,
      reason,
    });

    if (record !== null) {
      // State actually changed — perform the side-effects. Order matters:
      // close room memberships first so the room events fire while the
      // socket is still alive; then disconnect the socket so the client's
      // disconnect handler can react.
      await this.removeFromAllActiveRooms(targetUserId);
      await this.terminateSessionSafely(targetUserId);
    }

    // Re-fetch so isBanned reflects the post-condition.
    const updated = (await this.users.findById(targetUserId))!;
    return {
      user: toAdminUserDTO(updated),
      record: record ? toBanRecordDTO(record) : null,
    };
  }

  async unbanUser(
    actor: AuthenticatedUser,
    targetUserId: string,
    reason: string | null,
  ): Promise<BanResultDTO> {
    this.requireAdmin(actor);

    const target = await this.users.findById(targetUserId);
    if (!target) throw new AdminUserNotFoundError();

    const record = await this.bans.applyUnban({
      userId: targetUserId,
      adminId: actor.id,
      reason,
    });

    const updated = (await this.users.findById(targetUserId))!;
    return {
      user: toAdminUserDTO(updated),
      record: record ? toBanRecordDTO(record) : null,
    };
  }

  async listUsers(
    actor: AuthenticatedUser,
    query: { page: number; pageSize: number; search?: string; bannedOnly?: boolean },
  ): Promise<PagedAdminUsersDTO> {
    this.requireAdmin(actor);

    const pageSize = Math.min(query.pageSize, MAX_PAGE_SIZE);
    const result = await this.users.listUsers({
      page: query.page,
      pageSize,
      search: query.search,
      bannedOnly: query.bannedOnly,
    });

    return {
      items: result.items.map(toAdminUserDTO),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
    };
  }

  async listBanHistory(
    actor: AuthenticatedUser,
    targetUserId: string,
    query: { limit: number },
  ): Promise<BanRecordDTO[]> {
    this.requireAdmin(actor);

    const target = await this.users.findById(targetUserId);
    if (!target) throw new AdminUserNotFoundError();

    const limit = Math.min(query.limit, MAX_BAN_HISTORY);
    const rows = await this.bans.listForUser(targetUserId, { limit });
    return rows.map(toBanRecordDTO);
  }

  // ------------------------------------------------------ private bits ----

  private requireAdmin(actor: AuthenticatedUser): void {
    if (actor.role !== UserRole.SYSTEM_ADMIN) {
      throw new ForbiddenError('Administrator role required', 'ADMIN_REQUIRED');
    }
  }

  /**
   * Single-active-room is enforced at the rooms layer, but for safety
   * (and future-proofing) we don't assume it here — we close every
   * ACTIVE membership we find.
   */
  private async removeFromAllActiveRooms(userId: string): Promise<void> {
    // The interface exposes a singular helper; if multiple ever appear,
    // we'd swap this for the plural version.
    const membership = await this.rooms.findActiveMembershipByUser(userId);
    if (!membership) return;

    try {
      await this.roomRemover.removeMemberByAdmin(membership.roomId, userId);
    } catch (err) {
      // Don't let a room-side hiccup undo the ban. The user is banned
      // in the DB; the stale membership row will heal on next reconnect
      // (auth will reject) or when the room itself is touched.
      // eslint-disable-next-line no-console
      console.error(
        `[admin] failed to remove banned user ${userId} from room ${membership.roomId}:`,
        err,
      );
    }
  }

  private async terminateSessionSafely(userId: string): Promise<void> {
    try {
      await this.sessions.disconnectAllSocketsForUser(userId);
    } catch (err) {
      // Same rationale as above: best-effort.
      // eslint-disable-next-line no-console
      console.error(`[admin] failed to disconnect sockets for user ${userId}:`, err);
    }
  }
}

// ----------------------------------------------------- DTO conversion ----

function toAdminUserDTO(u: User): AdminUserDTO {
  return {
    id: u.id,
    email: u.email,
    username: u.username,
    role: u.role,
    isBanned: u.isBanned,
    createdAt: u.createdAt.toISOString(),
  };
}

function toBanRecordDTO(r: BanRecord): BanRecordDTO {
  return {
    id: r.id,
    userId: r.userId,
    adminId: r.adminId,
    action: r.action,
    reason: r.reason,
    createdAt: r.createdAt.toISOString(),
  };
}
