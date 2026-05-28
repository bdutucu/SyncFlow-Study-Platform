import { BanAction, UserRole } from '@prisma/client';

/**
 * Wire shape returned by GET /api/admin/users. Includes email since
 * admins legitimately need to identify users by it — non-admin
 * endpoints redact email.
 */
export interface AdminUserDTO {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
  createdAt: string; // ISO-8601
}

export interface PagedAdminUsersDTO {
  items: AdminUserDTO[];
  total: number;
  page: number;
  pageSize: number;
}

export interface BanRecordDTO {
  id: string;
  userId: string;
  adminId: string;
  action: BanAction;
  reason: string | null;
  createdAt: string; // ISO-8601
}

export interface BanResultDTO {
  user: AdminUserDTO;
  /** New record on a state change, null if the call was idempotent. */
  record: BanRecordDTO | null;
}

/**
 * IRoomMemberRemover — minimal slice of RoomService that AdminService
 * needs to cascade a ban into room departures. Defining it here (rather
 * than depending on RoomService directly) keeps AdminService unit-testable
 * with a recording mock and keeps the inter-module dependency explicit.
 *
 * RoomService implements this interface.
 */
export interface IRoomMemberRemover {
  /**
   * Removes a user from a room with administrative authority.
   * Idempotent if the user is not currently an active member.
   *
   * If the removed user was the host, the standard host-transfer /
   * room-close logic from DSD §3.2.2 kicks in.
   *
   * Authorization is the AdminService's responsibility — this method
   * trusts its caller, by design.
   */
  removeMemberByAdmin(roomId: string, userId: string): Promise<void>;
}

/**
 * IUserSessionEnforcer — terminates all open sockets for a given user.
 * Called by AdminService.banUser so that the ban feels immediate
 * rather than waiting up to 15 minutes (the JWT access TTL accepted in
 * DSD §3.5.5) for the user to be evicted on next refresh / reconnect.
 *
 * Production: SocketUserSessionEnforcer in admin.session.ts.
 * Tests: a recording mock that asserts the call was made.
 */
export interface IUserSessionEnforcer {
  disconnectAllSocketsForUser(userId: string): Promise<void>;
}
