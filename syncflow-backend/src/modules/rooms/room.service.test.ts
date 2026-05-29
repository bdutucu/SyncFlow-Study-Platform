import {
  Room,
  RoomMembership,
  MembershipStatus,
  RoomVisibility,
  User,
  UserRole,
} from '@prisma/client';
import {
  IRoomRepository,
  CreateRoomData,
  UpdateRoomData,
  ListPublicOptions,
  PagedRooms,
  MemberInfo,
} from '../../repositories/interfaces/IRoomRepository';
import {
  IUserRepository,
  CreateUserInput,
} from '../../repositories/interfaces/IUserRepository';
import { RoomService } from './room.service';
import { RecordingRoomEventPublisher } from './room.events';
import { AuthenticatedUser } from '../auth/auth.types';

// ---------------------------------------------------------------- fakes ----

class InMemoryUserRepo implements IUserRepository {
  users = new Map<string, User>();
  private n = 0;

  async findById(id: string) {
    return this.users.get(id) ?? null;
  }
  async findManyByIds(ids: string[]) {
    return ids.map((id) => this.users.get(id)).filter((u): u is User => !!u);
  }
  async listUsers() {
    // Not exercised by RoomService tests — admin listing lives in admin tests.
    return { items: [], total: 0, page: 1, pageSize: 0 };
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
      id,
      email: input.email,
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? UserRole.STANDARD,
      isBanned: false,
      createdAt: now,
      updatedAt: now,
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
}

class InMemoryRoomRepo implements IRoomRepository {
  rooms = new Map<string, Room>();
  memberships = new Map<string, RoomMembership>(); // key: userId|roomId
  private n = 0;

  constructor(private readonly users: InMemoryUserRepo) {}

  private key(userId: string, roomId: string) {
    return `${userId}|${roomId}`;
  }

  async createWithHostMembership(data: CreateRoomData): Promise<Room> {
    const id = `room_${++this.n}`;
    const now = new Date();
    const room: Room = {
      id,
      name: data.name,
      description: data.description,
      hostId: data.hostId,
      visibility: data.visibility,
      passwordHash: data.passwordHash,
      maxParticipants: data.maxParticipants,
      createdAt: now,
      updatedAt: now,
    };
    this.rooms.set(id, room);
    await this.activateMembership(data.hostId, id);
    return room;
  }

  async findById(id: string) {
    return this.rooms.get(id) ?? null;
  }

  async listPublic(options: ListPublicOptions): Promise<PagedRooms> {
    const all = [...this.rooms.values()]
      .filter((r) => r.visibility === 'PUBLIC')
      .filter((r) =>
        options.search
          ? r.name.toLowerCase().includes(options.search.toLowerCase()) ||
            (r.description ?? '').toLowerCase().includes(options.search.toLowerCase())
          : true,
      )
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const start = (options.page - 1) * options.pageSize;
    const items = all.slice(start, start + options.pageSize).map((r) => ({
      ...r,
      memberCount: [...this.memberships.values()].filter(
        (m) => m.roomId === r.id && m.status === 'ACTIVE',
      ).length,
    }));
    return { items, total: all.length, page: options.page, pageSize: options.pageSize };
  }

  async update(id: string, patch: UpdateRoomData): Promise<Room> {
    const r = this.rooms.get(id);
    if (!r) throw new Error('not found');
    Object.assign(r, patch, { updatedAt: new Date() });
    return r;
  }

  async delete(id: string): Promise<void> {
    this.rooms.delete(id);
    for (const k of [...this.memberships.keys()]) {
      if (this.memberships.get(k)!.roomId === id) this.memberships.delete(k);
    }
  }

  async transferHost(roomId: string, newHostId: string): Promise<Room> {
    const r = this.rooms.get(roomId);
    if (!r) throw new Error('not found');
    r.hostId = newHostId;
    return r;
  }

  async findMembership(userId: string, roomId: string) {
    return this.memberships.get(this.key(userId, roomId)) ?? null;
  }

  async findActiveMembershipByUser(userId: string) {
    return (
      [...this.memberships.values()].find(
        (m) => m.userId === userId && m.status === 'ACTIVE',
      ) ?? null
    );
  }

  async listActiveMembers(roomId: string): Promise<MemberInfo[]> {
    const rows = [...this.memberships.values()]
      .filter((m) => m.roomId === roomId && m.status === 'ACTIVE')
      .sort((a, b) => a.joinedAt.getTime() - b.joinedAt.getTime());
    return rows.map((m) => ({
      userId: m.userId,
      username: this.users.users.get(m.userId)?.username ?? '',
      joinedAt: m.joinedAt,
    }));
  }

  async countActiveMembers(roomId: string) {
    return [...this.memberships.values()].filter(
      (m) => m.roomId === roomId && m.status === 'ACTIVE',
    ).length;
  }

  async activateMembership(userId: string, roomId: string) {
    const k = this.key(userId, roomId);
    const existing = this.memberships.get(k);
    const now = new Date();
    if (existing) {
      existing.status = 'ACTIVE';
      existing.joinedAt = now;
      existing.leftAt = null;
      return existing;
    }
    const m: RoomMembership = {
      id: `m_${this.memberships.size + 1}`,
      userId,
      roomId,
      status: 'ACTIVE',
      joinedAt: now,
      leftAt: null,
    };
    this.memberships.set(k, m);
    return m;
  }

  async closeMembership(
    userId: string,
    roomId: string,
    status: Extract<MembershipStatus, 'LEFT' | 'KICKED'>,
  ) {
    const m = this.memberships.get(this.key(userId, roomId));
    if (!m) throw new Error('not found');
    m.status = status;
    m.leftAt = new Date();
    return m;
  }
}

// --------------------------------------------------------------- helpers ----

async function seedUser(users: InMemoryUserRepo, username: string, role: UserRole = UserRole.STANDARD) {
  return users.create({
    email: `${username}@example.com`,
    username,
    passwordHash: 'irrelevant',
    role,
  });
}

const asActor = (u: User): AuthenticatedUser => ({ id: u.id, role: u.role });

// ----------------------------------------------------------------- tests ----

describe('RoomService', () => {
  let userRepo: InMemoryUserRepo;
  let roomRepo: InMemoryRoomRepo;
  let publisher: RecordingRoomEventPublisher;
  let service: RoomService;
  let alice: User;
  let bob: User;
  let admin: User;

  beforeEach(async () => {
    userRepo = new InMemoryUserRepo();
    roomRepo = new InMemoryRoomRepo(userRepo);
    publisher = new RecordingRoomEventPublisher();
    service = new RoomService(roomRepo, userRepo, publisher);

    alice = await seedUser(userRepo, 'alice');
    bob = await seedUser(userRepo, 'bob');
    admin = await seedUser(userRepo, 'admin', UserRole.SYSTEM_ADMIN);
  });

  describe('createRoom', () => {
    it('creates a room with the creator as host + sole active member', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Study Hall',
        description: null,
        visibility: RoomVisibility.PUBLIC,
        password: null,
        maxParticipants: 10,
      });
      expect(room.hostId).toBe(alice.id);
      expect(room.members).toHaveLength(1);
      expect(room.members[0].isHost).toBe(true);
      expect(room.hasPassword).toBe(false);
    });

    it('hashes the password when one is set', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Private Lounge',
        description: null,
        visibility: RoomVisibility.PRIVATE,
        password: 'sekret',
        maxParticipants: 5,
      });
      expect(room.hasPassword).toBe(true);
    });
  });

  describe('joinRoom', () => {
    it('lets a second user join a public room and emits user_joined', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Room', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });

      const after = await service.joinRoom(asActor(bob), room.id, undefined);
      expect(after.members).toHaveLength(2);
      expect(publisher.events.some((e) => e.type === 'user_joined')).toBe(true);
    });

    it('rejects joining when the room is full', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Tiny', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 2,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      const carol = await seedUser(userRepo, 'carol');
      await expect(service.joinRoom(asActor(carol), room.id, undefined))
        .rejects.toThrow(/capacity|full/i);
    });

    it('rejects joining a second room while still active in another', async () => {
      // createRoom auto-adds the host as an active member, so bob would
      // have memberships in BOTH r1 and r2 simultaneously if we didn't
      // explicitly leave r2 first. The user-facing flow does this as
      // well — the UI always calls leave before joining elsewhere.
      const r1 = await service.createRoom(asActor(alice), {
        name: 'R1', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      const r2 = await service.createRoom(asActor(bob), {
        name: 'R2', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });

      // Carol is the actual subject of this test — she has no prior
      // memberships, joins r1 cleanly, then must be rejected on r2.
      const carol = await seedUser(userRepo, 'carol');
      await service.joinRoom(asActor(carol), r1.id, undefined);
      await expect(service.joinRoom(asActor(carol), r2.id, undefined))
        .rejects.toThrow(/already.*another room/i);

      // bob is unused by the actual assertion; reference the variable to
      // keep the create-room call meaningful and silence the linter.
      expect(r2.hostId).toBe(bob.id);
    });

    it('rejects wrong password and accepts correct one', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Locked', description: null, visibility: RoomVisibility.PUBLIC,
        password: 'open-sesame', maxParticipants: 10,
      });
      await expect(service.joinRoom(asActor(bob), room.id, 'wrong'))
        .rejects.toThrow(/password/i);
      await expect(service.joinRoom(asActor(bob), room.id, undefined))
        .rejects.toThrow(/password/i);
      const ok = await service.joinRoom(asActor(bob), room.id, 'open-sesame');
      expect(ok.members).toHaveLength(2);
    });
  });

  describe('leaveRoom', () => {
    it('emits user_left and shrinks the member list', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      await service.leaveRoom(asActor(bob), room.id);
      const after = await service.getRoom(asActor(alice), room.id);
      expect(after.members).toHaveLength(1);
      expect(publisher.events.some((e) => e.type === 'user_left')).toBe(true);
    });

    it('transfers host to the most-senior member when host leaves', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      await service.leaveRoom(asActor(alice), room.id);

      const after = await service.getRoom(asActor(bob), room.id);
      expect(after.hostId).toBe(bob.id);
      expect(publisher.events.some((e) => e.type === 'host_changed')).toBe(true);
    });

    it('closes the room when the host is the last to leave', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Solo', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.leaveRoom(asActor(alice), room.id);

      await expect(service.getRoom(asActor(alice), room.id))
        .rejects.toThrow(/not found/i);
      expect(publisher.events.some((e) => e.type === 'room_deleted')).toBe(true);
    });
  });

  describe('updateRoom / deleteRoom', () => {
    it('rejects update by a non-host non-admin', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      await expect(
        service.updateRoom(asActor(bob), room.id, { name: 'Hacked' }),
      ).rejects.toThrow(/host/i);
    });

    it('allows admin override of update', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      const after = await service.updateRoom(asActor(admin), room.id, {
        name: 'Renamed by admin',
      });
      expect(after.name).toBe('Renamed by admin');
    });

    it('allows admin to delete any room', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.deleteRoom(asActor(admin), room.id);
      await expect(service.getRoom(asActor(alice), room.id))
        .rejects.toThrow(/not found/i);
    });
  });

  describe('kickMember', () => {
    it('host can kick a non-host member', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      await service.kickMember(asActor(alice), room.id, bob.id);

      const after = await service.getRoom(asActor(alice), room.id);
      expect(after.members).toHaveLength(1);
      expect(publisher.events.some((e) => e.type === 'user_kicked')).toBe(true);
    });

    it('host cannot kick themselves', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await expect(service.kickMember(asActor(alice), room.id, alice.id))
        .rejects.toThrow(/yourself/i);
    });

    it('non-host cannot kick', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'R', description: null, visibility: RoomVisibility.PUBLIC,
        password: null, maxParticipants: 10,
      });
      await service.joinRoom(asActor(bob), room.id, undefined);
      await expect(service.kickMember(asActor(bob), room.id, alice.id))
        .rejects.toThrow(/host/i);
    });
  });

  describe('listPublicRooms', () => {
    it('returns only PUBLIC rooms and supports search', async () => {
      await service.createRoom(asActor(alice), {
        name: 'Physics study', description: null,
        visibility: RoomVisibility.PUBLIC, password: null, maxParticipants: 10,
      });
      await service.createRoom(asActor(bob), {
        name: 'Secret cabal', description: null,
        visibility: RoomVisibility.PRIVATE, password: null, maxParticipants: 10,
      });

      const all = await service.listPublicRooms({ page: 1, pageSize: 20 });
      expect(all.items.map((r) => r.name)).toEqual(['Physics study']);

      const hit = await service.listPublicRooms({ page: 1, pageSize: 20, search: 'physics' });
      expect(hit.total).toBe(1);

      const miss = await service.listPublicRooms({ page: 1, pageSize: 20, search: 'zzz' });
      expect(miss.total).toBe(0);
    });
  });

  describe('private room visibility', () => {
    it('hides private room details from non-members', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Hidden', description: null, visibility: RoomVisibility.PRIVATE,
        password: null, maxParticipants: 10,
      });
      await expect(service.getRoom(asActor(bob), room.id))
        .rejects.toThrow(/member/i);
    });

    it('admin can read any private room', async () => {
      const room = await service.createRoom(asActor(alice), {
        name: 'Hidden', description: null, visibility: RoomVisibility.PRIVATE,
        password: null, maxParticipants: 10,
      });
      const seen = await service.getRoom(asActor(admin), room.id);
      expect(seen.id).toBe(room.id);
    });
  });
});
