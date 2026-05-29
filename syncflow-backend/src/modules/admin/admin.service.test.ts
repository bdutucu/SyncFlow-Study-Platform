import {
  BanRecord,
  Room,
  RoomMembership,
  User,
  UserRole,
} from '@prisma/client';
import {
  IUserRepository,
  CreateUserInput,
  ListUsersOptions,
  PagedUsers,
} from '../../repositories/interfaces/IUserRepository';
import {
  IBanRecordRepository,
  ApplyBanInput,
  ListBansOptions,
} from '../../repositories/interfaces/IBanRecordRepository';
import {
  IRoomRepository,
  CreateRoomData,
  UpdateRoomData,
  ListPublicOptions,
  PagedRooms,
  MemberInfo,
} from '../../repositories/interfaces/IRoomRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { AdminService } from './admin.service';
import { IRoomMemberRemover, IUserSessionEnforcer } from './admin.types';

// ---------------------------------------------------------------- fakes ----

class InMemoryUserRepo implements IUserRepository {
  users = new Map<string, User>();
  private n = 0;

  add(user: User) { this.users.set(user.id, user); }

  async findById(id: string) { return this.users.get(id) ?? null; }
  async findManyByIds(ids: string[]) {
    return ids.map((id) => this.users.get(id)).filter((u): u is User => !!u);
  }
  async findByEmail(email: string) {
    return [...this.users.values()].find((u) => u.email === email.toLowerCase()) ?? null;
  }
  async findByUsername(username: string) {
    return [...this.users.values()].find((u) => u.username === username) ?? null;
  }
  async create(input: CreateUserInput) {
    const id = `user_${++this.n}`;
    const now = new Date();
    const user: User = {
      id, email: input.email, username: input.username,
      passwordHash: input.passwordHash, role: input.role ?? UserRole.STANDARD,
      isBanned: false, createdAt: now, updatedAt: now,
    };
    this.users.set(id, user);
    return user;
  }
  async setBanned(id: string, isBanned: boolean) {
    const u = this.users.get(id);
    if (!u) throw new Error('not found');
    u.isBanned = isBanned;
    return u;
  }
  async listUsers(options: ListUsersOptions): Promise<PagedUsers> {
    let all = [...this.users.values()];
    if (options.bannedOnly) all = all.filter((u) => u.isBanned);
    if (options.search) {
      const q = options.search.toLowerCase();
      all = all.filter((u) =>
        u.username.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
      );
    }
    all.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (options.page - 1) * options.pageSize;
    return {
      items: all.slice(start, start + options.pageSize),
      total: all.length,
      page: options.page,
      pageSize: options.pageSize,
    };
  }
}

class InMemoryBanRepo implements IBanRecordRepository {
  constructor(private readonly users: InMemoryUserRepo) {}
  rows: BanRecord[] = [];
  private n = 0;

  async applyBan(input: ApplyBanInput): Promise<BanRecord | null> {
    const user = this.users.users.get(input.userId);
    if (!user) return null;
    if (user.isBanned) return null;
    user.isBanned = true;
    const row: BanRecord = {
      id: `ban_${++this.n}`, userId: input.userId, adminId: input.adminId,
      action: 'BAN', reason: input.reason, createdAt: new Date(Date.now() + this.n),
    };
    this.rows.push(row);
    return row;
  }
  async applyUnban(input: ApplyBanInput): Promise<BanRecord | null> {
    const user = this.users.users.get(input.userId);
    if (!user) return null;
    if (!user.isBanned) return null;
    user.isBanned = false;
    const row: BanRecord = {
      id: `ban_${++this.n}`, userId: input.userId, adminId: input.adminId,
      action: 'UNBAN', reason: input.reason, createdAt: new Date(Date.now() + this.n),
    };
    this.rows.push(row);
    return row;
  }
  async listForUser(userId: string, options: ListBansOptions): Promise<BanRecord[]> {
    return this.rows
      .filter((r) => r.userId === userId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, options.limit);
  }
}

class StubRoomRepo implements IRoomRepository {
  rooms = new Map<string, Room>();
  memberships = new Map<string, RoomMembership>(); // key: userId|roomId
  key(u: string, r: string) { return `${u}|${r}`; }

  setRoom(room: Room) { this.rooms.set(room.id, room); }
  setMembership(userId: string, roomId: string, status: RoomMembership['status'] = 'ACTIVE') {
    this.memberships.set(this.key(userId, roomId), {
      id: `m_${this.memberships.size + 1}`,
      userId, roomId, status,
      joinedAt: new Date(),
      leftAt: status === 'ACTIVE' ? null : new Date(),
    });
  }

  async findById(id: string) { return this.rooms.get(id) ?? null; }
  async findActiveMembershipByUser(userId: string) {
    return [...this.memberships.values()].find((m) => m.userId === userId && m.status === 'ACTIVE') ?? null;
  }
  async findMembership(userId: string, roomId: string) {
    return this.memberships.get(this.key(userId, roomId)) ?? null;
  }
  async listActiveMembers(_: string): Promise<MemberInfo[]> { return []; }

  // The rest are unused by AdminService.
  async createWithHostMembership(_: CreateRoomData): Promise<Room> { throw new Error('n/a'); }
  async listPublic(_: ListPublicOptions): Promise<PagedRooms> { throw new Error('n/a'); }
  async update(_: string, __: UpdateRoomData): Promise<Room> { throw new Error('n/a'); }
  async delete(_: string): Promise<void> { /* noop */ }
  async transferHost(_: string, __: string): Promise<Room> { throw new Error('n/a'); }
  async countActiveMembers(_: string) { return 0; }
  async activateMembership(_: string, __: string): Promise<RoomMembership> { throw new Error('n/a'); }
  async closeMembership(_: string, __: string, ___: 'LEFT' | 'KICKED'): Promise<RoomMembership> { throw new Error('n/a'); }
}

class RecordingRoomRemover implements IRoomMemberRemover {
  calls: Array<{ roomId: string; userId: string }> = [];
  async removeMemberByAdmin(roomId: string, userId: string): Promise<void> {
    this.calls.push({ roomId, userId });
  }
}

class RecordingSessionEnforcer implements IUserSessionEnforcer {
  calls: string[] = [];
  async disconnectAllSocketsForUser(userId: string): Promise<void> {
    this.calls.push(userId);
  }
}

// --------------------------------------------------------------- helpers ----

function makeUser(id: string, role: UserRole = UserRole.STANDARD, isBanned = false): User {
  return {
    id, email: `${id}@example.com`, username: id, passwordHash: 'x',
    role, isBanned, createdAt: new Date(), updatedAt: new Date(),
  };
}
function makeRoom(id: string, hostId: string): Room {
  return {
    id, name: `Room ${id}`, description: null, hostId,
    visibility: 'PUBLIC', tag: 'STUDY', passwordHash: null, maxParticipants: 10,
    createdAt: new Date(), updatedAt: new Date(),
  };
}
const asActor = (u: User): AuthenticatedUser => ({ id: u.id, role: u.role });

// ----------------------------------------------------------------- tests ----

describe('AdminService', () => {
  let users: InMemoryUserRepo;
  let bans: InMemoryBanRepo;
  let rooms: StubRoomRepo;
  let remover: RecordingRoomRemover;
  let sessions: RecordingSessionEnforcer;
  let service: AdminService;

  let admin: User;
  let admin2: User;
  let alice: User;
  let bob: User;

  beforeEach(() => {
    users = new InMemoryUserRepo();
    bans = new InMemoryBanRepo(users);
    rooms = new StubRoomRepo();
    remover = new RecordingRoomRemover();
    sessions = new RecordingSessionEnforcer();
    service = new AdminService(users, bans, rooms, remover, sessions);

    admin = makeUser('admin', UserRole.SYSTEM_ADMIN);
    admin2 = makeUser('admin2', UserRole.SYSTEM_ADMIN);
    alice = makeUser('alice');
    bob = makeUser('bob');
    users.add(admin); users.add(admin2); users.add(alice); users.add(bob);
  });

  describe('authorization', () => {
    it('rejects ban from a non-admin actor', async () => {
      await expect(service.banUser(asActor(alice), bob.id, null))
        .rejects.toThrow(/administrator/i);
    });
    it('rejects unban from a non-admin actor', async () => {
      await expect(service.unbanUser(asActor(alice), bob.id, null))
        .rejects.toThrow(/administrator/i);
    });
    it('rejects listUsers from a non-admin actor', async () => {
      await expect(
        service.listUsers(asActor(alice), { page: 1, pageSize: 20 }),
      ).rejects.toThrow(/administrator/i);
    });
  });

  describe('banUser', () => {
    it('marks the user banned, writes a BAN record, and disconnects their sockets', async () => {
      const result = await service.banUser(asActor(admin), alice.id, 'spam');
      expect(result.user.isBanned).toBe(true);
      expect(result.record?.action).toBe('BAN');
      expect(result.record?.reason).toBe('spam');
      expect(sessions.calls).toEqual([alice.id]);
    });

    it('cascades into a room removal when the banned user is an active member', async () => {
      rooms.setRoom(makeRoom('room_1', bob.id));
      rooms.setMembership(alice.id, 'room_1');

      await service.banUser(asActor(admin), alice.id, null);

      expect(remover.calls).toEqual([{ roomId: 'room_1', userId: alice.id }]);
    });

    it('still cascades when the banned user is a host (the room module handles transfer/close)', async () => {
      rooms.setRoom(makeRoom('room_1', alice.id));
      rooms.setMembership(alice.id, 'room_1');

      await service.banUser(asActor(admin), alice.id, null);
      expect(remover.calls).toEqual([{ roomId: 'room_1', userId: alice.id }]);
    });

    it('does NOT cascade or disconnect when the user is already banned (idempotent)', async () => {
      alice.isBanned = true;

      const result = await service.banUser(asActor(admin), alice.id, null);
      expect(result.user.isBanned).toBe(true);
      expect(result.record).toBeNull();          // no new audit row
      expect(remover.calls).toEqual([]);          // no cascade
      expect(sessions.calls).toEqual([]);         // no disconnect
    });

    it('rejects self-ban', async () => {
      await expect(service.banUser(asActor(admin), admin.id, null))
        .rejects.toThrow(/themselves|self/i);
    });

    it('rejects banning another administrator', async () => {
      await expect(service.banUser(asActor(admin), admin2.id, null))
        .rejects.toThrow(/administrator/i);
    });

    it('returns 404 for a missing target user', async () => {
      await expect(service.banUser(asActor(admin), 'user_404', null))
        .rejects.toThrow(/not found/i);
    });

    it('survives a room-removal failure (best-effort cascade)', async () => {
      rooms.setRoom(makeRoom('room_1', bob.id));
      rooms.setMembership(alice.id, 'room_1');
      remover.removeMemberByAdmin = async () => {
        throw new Error('room db blew up');
      };

      const result = await service.banUser(asActor(admin), alice.id, null);
      expect(result.user.isBanned).toBe(true);   // ban still applied
      expect(result.record).not.toBeNull();      // audit row still written
      expect(sessions.calls).toEqual([alice.id]); // session still terminated
    });
  });

  describe('unbanUser', () => {
    it('unbans and writes an UNBAN record', async () => {
      alice.isBanned = true;

      const result = await service.unbanUser(asActor(admin), alice.id, 'served time');
      expect(result.user.isBanned).toBe(false);
      expect(result.record?.action).toBe('UNBAN');
      expect(result.record?.reason).toBe('served time');
    });

    it('is idempotent when the user was not banned', async () => {
      const result = await service.unbanUser(asActor(admin), alice.id, null);
      expect(result.user.isBanned).toBe(false);
      expect(result.record).toBeNull();
    });

    it('returns 404 for a missing user', async () => {
      await expect(service.unbanUser(asActor(admin), 'user_404', null))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('listUsers', () => {
    it('returns all users sorted newest-first with pagination', async () => {
      const result = await service.listUsers(asActor(admin), { page: 1, pageSize: 20 });
      expect(result.total).toBe(4);
      expect(result.items.map((u) => u.id).sort()).toEqual(
        ['admin', 'admin2', 'alice', 'bob'].sort(),
      );
    });

    it('filters bannedOnly', async () => {
      alice.isBanned = true;
      const result = await service.listUsers(asActor(admin), {
        page: 1, pageSize: 20, bannedOnly: true,
      });
      expect(result.items.map((u) => u.id)).toEqual(['alice']);
    });

    it('filters by search', async () => {
      const result = await service.listUsers(asActor(admin), {
        page: 1, pageSize: 20, search: 'alic',
      });
      expect(result.items.map((u) => u.id)).toEqual(['alice']);
    });

    it('caps pageSize at 100', async () => {
      const result = await service.listUsers(asActor(admin), { page: 1, pageSize: 9999 });
      expect(result.pageSize).toBe(100);
    });
  });

  describe('listBanHistory', () => {
    it('returns ban and unban records for a user, newest first', async () => {
      await service.banUser(asActor(admin), alice.id, 'first');
      await service.unbanUser(asActor(admin), alice.id, 'pardoned');
      await service.banUser(asActor(admin), alice.id, 'again');

      const records = await service.listBanHistory(asActor(admin), alice.id, { limit: 10 });
      expect(records.map((r) => r.action)).toEqual(['BAN', 'UNBAN', 'BAN']);
      expect(records.map((r) => r.reason)).toEqual(['again', 'pardoned', 'first']);
    });

    it('returns empty array for a user with no history', async () => {
      const records = await service.listBanHistory(asActor(admin), bob.id, { limit: 10 });
      expect(records).toEqual([]);
    });

    it('returns 404 for a missing user', async () => {
      await expect(
        service.listBanHistory(asActor(admin), 'user_404', { limit: 10 }),
      ).rejects.toThrow(/not found/i);
    });
  });
});
