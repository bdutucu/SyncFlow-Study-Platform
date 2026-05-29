import { UserRole } from '@prisma/client';
import {
  IRoomRepository,
  MemberInfo,
} from '../../repositories/interfaces/IRoomRepository';
import { IUserRepository } from '../../repositories/interfaces/IUserRepository';
import { hashPassword, verifyPassword } from '../../shared/password';
import {
  CreateRoomInput,
  UpdateRoomInput,
} from './room.validators';
import {
  MemberDTO,
  PagedRoomsDTO,
  RoomDetails,
  RoomLifecycleListener,
  RoomSummary,
} from './room.types';
import { IRoomEventPublisher } from './room.events';
import { AuthenticatedUser } from '../auth/auth.types';
import {
  RoomNotFoundError,
  RoomFullError,
  AlreadyInAnotherRoomError,
  NotAMemberError,
  WrongRoomPasswordError,
  RoomPasswordRequiredError,
  HostActionForbiddenError,
  CannotKickHostError,
  CannotKickSelfError,
} from './room.errors';

/**
 * RoomService — Room Management component (DSD §3.2.2).
 *
 * Responsibilities (functional requirements):
 *   • Create / read / update / delete rooms (host-gated for write ops).
 *   • Public listing with pagination + search.
 *   • Join / leave with capacity, single-active-room, and password checks.
 *   • Automatic host transfer on host leave, or room close when host is
 *     last to leave.
 *   • Host-driven kick (also performs the implicit leave).
 *
 * Authorization rules:
 *   • Host actions (update, delete, kick) are allowed for the host of the
 *     room OR any SYSTEM_ADMIN (DSD §3.5.5 / §3.2.6).
 *
 * Live events are published through IRoomEventPublisher; the
 * Socket.IO-backed implementation lives in room.events.ts.
 */
export class RoomService {
  private readonly lifecycleListeners: RoomLifecycleListener[] = [];

  constructor(
    private readonly rooms: IRoomRepository,
    private readonly users: IUserRepository,
    private readonly publisher: IRoomEventPublisher,
  ) {}

  /** Register a listener for room lifecycle events (DSD-internal hook). */
  addLifecycleListener(listener: RoomLifecycleListener): void {
    this.lifecycleListeners.push(listener);
  }

  private async notifyRoomDeleted(roomId: string): Promise<void> {
    for (const l of this.lifecycleListeners) {
      try {
        await l.onRoomDeleted?.(roomId);
      } catch (err) {
        // A listener failure must not block room deletion.
        // eslint-disable-next-line no-console
        console.error(`[rooms] lifecycle listener threw for room ${roomId}:`, err);
      }
    }
  }

  // ---------------------------------------------------------------- CRUD ----

  async createRoom(actor: AuthenticatedUser, input: CreateRoomInput): Promise<RoomDetails> {
    // Single-active-room rule: createRoom auto-adds the creator as the
    // host's active member, which would silently land them in two rooms
    // at once if they already have an active membership. Enforce the
    // same rule joinRoom enforces (DSD §3.2.2). Admins are exempt — a
    // moderator may need to open rooms for support without first
    // leaving their own session.
    if (actor.role !== UserRole.SYSTEM_ADMIN) {
      const existingActive = await this.rooms.findActiveMembershipByUser(actor.id);
      if (existingActive) throw new AlreadyInAnotherRoomError();
    }

    const passwordHash = input.password ? await hashPassword(input.password) : null;

    const room = await this.rooms.createWithHostMembership({
      name: input.name,
      description: input.description,
      hostId: actor.id,
      visibility: input.visibility,
      passwordHash,
      maxParticipants: input.maxParticipants,
    });

    // Host is now the sole active member.
    return this.buildRoomDetails(room.id);
  }

  /**
   * Returns the caller's currently-active room (if any). Used by the
   * lobby UI to highlight "you're already here" and surface a leave
   * shortcut so users don't try to side-step the one-active-room rule.
   */
  async getMyActiveRoom(actor: AuthenticatedUser): Promise<RoomSummary | null> {
    const membership = await this.rooms.findActiveMembershipByUser(actor.id);
    if (!membership) return null;
    const room = await this.rooms.findById(membership.roomId);
    if (!room) return null;
    const memberCount = await this.rooms.countActiveMembers(room.id);
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      hostId: room.hostId,
      visibility: room.visibility,
      hasPassword: room.passwordHash !== null,
      maxParticipants: room.maxParticipants,
      memberCount,
      createdAt: room.createdAt.toISOString(),
    };
  }

  async listPublicRooms(query: {
    page: number;
    pageSize: number;
    search?: string;
  }): Promise<PagedRoomsDTO> {
    const paged = await this.rooms.listPublic(query);
    return {
      total: paged.total,
      page: paged.page,
      pageSize: paged.pageSize,
      items: paged.items.map((r) => ({
        id: r.id,
        name: r.name,
        description: r.description,
        hostId: r.hostId,
        visibility: r.visibility,
        hasPassword: r.passwordHash !== null,
        maxParticipants: r.maxParticipants,
        memberCount: r.memberCount,
        createdAt: r.createdAt.toISOString(),
      })),
    };
  }

  async getRoom(actor: AuthenticatedUser, roomId: string): Promise<RoomDetails> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();

    // Private rooms are only readable to active members + admins.
    if (room.visibility === 'PRIVATE' && !this.isAdmin(actor)) {
      const m = await this.rooms.findMembership(actor.id, roomId);
      if (!m || m.status !== 'ACTIVE') throw new NotAMemberError();
    }

    return this.buildRoomDetails(roomId);
  }

  async updateRoom(
    actor: AuthenticatedUser,
    roomId: string,
    patch: UpdateRoomInput,
  ): Promise<RoomDetails> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    if (!this.canHost(actor, room.hostId)) throw new HostActionForbiddenError();

    // Translate optional `password` into passwordHash for the repo layer.
    // undefined  → no change; null → clear; string → re-hash.
    let passwordHashPatch: { passwordHash?: string | null } = {};
    if (patch.password === null) passwordHashPatch = { passwordHash: null };
    else if (typeof patch.password === 'string') {
      passwordHashPatch = { passwordHash: await hashPassword(patch.password) };
    }

    await this.rooms.update(roomId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
      ...(patch.visibility !== undefined ? { visibility: patch.visibility } : {}),
      ...(patch.maxParticipants !== undefined
        ? { maxParticipants: patch.maxParticipants }
        : {}),
      ...passwordHashPatch,
    });

    const details = await this.buildRoomDetails(roomId);
    this.publisher.roomUpdated(roomId, this.toSummary(details));
    return details;
  }

  async deleteRoom(actor: AuthenticatedUser, roomId: string): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    if (!this.canHost(actor, room.hostId)) throw new HostActionForbiddenError();

    // Publish BEFORE deletion so subscribers learn why their channel closed.
    this.publisher.roomDeleted(roomId);
    await this.rooms.delete(roomId);
    await this.notifyRoomDeleted(roomId);
  }

  // ----------------------------------------------------- Join / Leave ----

  async joinRoom(
    actor: AuthenticatedUser,
    roomId: string,
    password: string | undefined,
  ): Promise<RoomDetails> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();

    // 0. Live ban check — DSD §3.5.5 trade-off says REST middleware skips
    //    the DB hit, but `joinRoom` is THE common path a banned user
    //    would take to "come back" with their still-valid 15-min JWT.
    //    Catch them here so the ban feels truly immediate.
    const fresh = await this.users.findById(actor.id);
    if (fresh?.isBanned) {
      // Lazy import to avoid a circular dep at module load.
      const { AccountBannedError } = await import('../auth/auth.errors');
      throw new AccountBannedError();
    }

    // 1. Single-active-room enforcement.
    const existingActive = await this.rooms.findActiveMembershipByUser(actor.id);
    if (existingActive && existingActive.roomId !== roomId) {
      throw new AlreadyInAnotherRoomError();
    }

    // 2. Password gate (if any). Host re-entering their own room is always allowed.
    const alreadyHost = room.hostId === actor.id;
    if (room.passwordHash && !alreadyHost) {
      if (!password) throw new RoomPasswordRequiredError();
      const ok = await verifyPassword(password, room.passwordHash);
      if (!ok) throw new WrongRoomPasswordError();
    }

    // 3. Capacity check (skip if user is already an active member — re-join no-op).
    const existingMembership = await this.rooms.findMembership(actor.id, roomId);
    const isReturning = existingMembership?.status === 'ACTIVE';
    if (!isReturning) {
      const count = await this.rooms.countActiveMembers(roomId);
      if (count >= room.maxParticipants) throw new RoomFullError();
    }

    await this.rooms.activateMembership(actor.id, roomId);

    if (!isReturning) {
      const user = await this.users.findById(actor.id);
      this.publisher.userJoined(roomId, {
        userId: actor.id,
        username: user?.username ?? '',
        isHost: alreadyHost,
        joinedAt: new Date().toISOString(),
      });
    }

    return this.buildRoomDetails(roomId);
  }

  async leaveRoom(actor: AuthenticatedUser, roomId: string): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();

    const membership = await this.rooms.findMembership(actor.id, roomId);
    if (!membership || membership.status !== 'ACTIVE') throw new NotAMemberError();

    await this.rooms.closeMembership(actor.id, roomId, 'LEFT');
    this.publisher.userLeft(roomId, actor.id);

    // Host transfer / room close (DSD §3.2.2).
    if (room.hostId === actor.id) {
      await this.handleHostLeaving(roomId, actor.id);
    }
  }

  async kickMember(
    actor: AuthenticatedUser,
    roomId: string,
    targetUserId: string,
  ): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();
    if (!this.canHost(actor, room.hostId)) throw new HostActionForbiddenError();
    if (targetUserId === actor.id) throw new CannotKickSelfError();
    if (targetUserId === room.hostId) throw new CannotKickHostError();

    const m = await this.rooms.findMembership(targetUserId, roomId);
    if (!m || m.status !== 'ACTIVE') throw new NotAMemberError();

    await this.rooms.closeMembership(targetUserId, roomId, 'KICKED');
    this.publisher.userKicked(roomId, targetUserId);
    this.publisher.userLeft(roomId, targetUserId);
  }

  /**
   * Administrative removal — bypasses the host gating that kickMember
   * enforces. Used by the Admin Moderation module (DSD §3.2.6) to
   * cascade a global user ban into any room they're a member of.
   *
   * Idempotent if the user is not currently active in the room.
   * If the removed user was the host, the standard host-transfer /
   * room-close logic runs (DSD §3.2.2).
   *
   * Authorization is the caller's responsibility — this method trusts
   * its caller, and AdminService is the only authorised caller in
   * the composition root.
   */
  async removeMemberByAdmin(roomId: string, userId: string): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) return; // room may have been deleted concurrently

    const membership = await this.rooms.findMembership(userId, roomId);
    if (!membership || membership.status !== 'ACTIVE') return;

    await this.rooms.closeMembership(userId, roomId, 'KICKED');
    this.publisher.userKicked(roomId, userId);
    this.publisher.userLeft(roomId, userId);

    if (room.hostId === userId) {
      await this.handleHostLeaving(roomId, userId);
    }
  }

  // -------------------------------------------------- Membership reads ----

  async listMembers(actor: AuthenticatedUser, roomId: string): Promise<MemberDTO[]> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new RoomNotFoundError();

    // Private rooms: only members + admins may inspect.
    if (room.visibility === 'PRIVATE' && !this.isAdmin(actor)) {
      const m = await this.rooms.findMembership(actor.id, roomId);
      if (!m || m.status !== 'ACTIVE') throw new NotAMemberError();
    }

    const members = await this.rooms.listActiveMembers(roomId);
    return members.map((mi) => this.toMemberDTO(mi, room.hostId));
  }

  /** Convenience used by Socket.IO subscribe handler. */
  async isActiveMember(userId: string, roomId: string): Promise<boolean> {
    const m = await this.rooms.findMembership(userId, roomId);
    return !!m && m.status === 'ACTIVE';
  }

  // ----------------------------------------------------------- helpers ----

  private async handleHostLeaving(roomId: string, oldHostId: string): Promise<void> {
    const remaining = await this.rooms.listActiveMembers(roomId);
    if (remaining.length === 0) {
      // No one left: close the room.
      this.publisher.roomDeleted(roomId);
      await this.rooms.delete(roomId);
      await this.notifyRoomDeleted(roomId);
      return;
    }
    // Promote the most senior remaining member.
    const newHost = remaining[0]; // listActiveMembers is ordered by joinedAt asc
    await this.rooms.transferHost(roomId, newHost.userId);
    this.publisher.hostChanged(roomId, newHost.userId, oldHostId);
  }

  private canHost(actor: AuthenticatedUser, hostId: string): boolean {
    return actor.id === hostId || this.isAdmin(actor);
  }

  private isAdmin(actor: AuthenticatedUser): boolean {
    return actor.role === UserRole.SYSTEM_ADMIN;
  }

  private async buildRoomDetails(roomId: string): Promise<RoomDetails> {
    const [room, members] = await Promise.all([
      this.rooms.findById(roomId),
      this.rooms.listActiveMembers(roomId),
    ]);
    if (!room) throw new RoomNotFoundError();
    return {
      id: room.id,
      name: room.name,
      description: room.description,
      hostId: room.hostId,
      visibility: room.visibility,
      hasPassword: room.passwordHash !== null,
      maxParticipants: room.maxParticipants,
      memberCount: members.length,
      createdAt: room.createdAt.toISOString(),
      members: members.map((mi) => this.toMemberDTO(mi, room.hostId)),
    };
  }

  private toMemberDTO(info: MemberInfo, hostId: string): MemberDTO {
    return {
      userId: info.userId,
      username: info.username,
      isHost: info.userId === hostId,
      joinedAt: info.joinedAt.toISOString(),
    };
  }

  private toSummary(d: RoomDetails): RoomSummary {
    // RoomDetails minus members, keep everything else.
    const { members: _members, ...rest } = d;
    return rest;
  }
}
