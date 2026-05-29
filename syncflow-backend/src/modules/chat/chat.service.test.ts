import {
  ChatMessage,
  Room,
  RoomMembership,
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
  IChatMessageRepository,
  ChatMessageWithAuthor,
  CreateChatMessageInput,
  ListMessagesOptions,
} from '../../repositories/interfaces/IChatMessageRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { ChatService } from './chat.service';
import { RecordingChatEventPublisher } from './chat.events';

// ---------------------------------------------------------------- fakes ----

/** Minimal IRoomRepository stub with the methods ChatService uses. */
class StubRoomRepo implements IRoomRepository {
  rooms = new Map<string, Room>();
  members = new Map<string, Map<string, RoomMembership>>(); // roomId → userId → m

  setRoom(room: Room) {
    this.rooms.set(room.id, room);
    if (!this.members.has(room.id)) this.members.set(room.id, new Map());
  }
  setActive(roomId: string, userId: string) {
    const map = this.members.get(roomId) ?? new Map();
    map.set(userId, {
      id: `m_${roomId}_${userId}`,
      userId,
      roomId,
      status: 'ACTIVE',
      joinedAt: new Date(),
      leftAt: null,
    });
    this.members.set(roomId, map);
  }
  async findById(id: string) { return this.rooms.get(id) ?? null; }
  async findMembership(userId: string, roomId: string) {
    return this.members.get(roomId)?.get(userId) ?? null;
  }
  async listActiveMembers(_: string): Promise<MemberInfo[]> { return []; }

  // Unused stubs:
  async createWithHostMembership(_: CreateRoomData): Promise<Room> { throw new Error('n/a'); }
  async listPublic(_: ListPublicOptions): Promise<PagedRooms> { throw new Error('n/a'); }
  async update(_: string, __: UpdateRoomData): Promise<Room> { throw new Error('n/a'); }
  async delete(_: string): Promise<void> { /* noop */ }
  async transferHost(_: string, __: string): Promise<Room> { throw new Error('n/a'); }
  async findActiveMembershipByUser(_: string) { return null; }
  async countActiveMembers(_: string) { return 0; }
  async activateMembership(_: string, __: string): Promise<RoomMembership> { throw new Error('n/a'); }
  async closeMembership(_: string, __: string, ___: 'LEFT' | 'KICKED'): Promise<RoomMembership> { throw new Error('n/a'); }
}

/** In-memory chat repository for tests. */
class InMemoryChatRepo implements IChatMessageRepository {
  rows = new Map<string, ChatMessageWithAuthor>();
  usernames = new Map<string, string>();
  private clock = 0;
  private counter = 0;

  registerUser(userId: string, username: string) {
    this.usernames.set(userId, username);
  }

  async create(input: CreateChatMessageInput): Promise<ChatMessageWithAuthor> {
    const id = `msg_${++this.counter}`;
    // Strictly monotonic createdAt for deterministic ordering, even when
    // multiple writes happen in the same Jest tick.
    this.clock += 1;
    const row: ChatMessageWithAuthor = {
      id,
      roomId: input.roomId,
      authorId: input.authorId,
      content: input.content,
      isDeleted: false,
      deletedAt: null,
      deletedById: null,
      createdAt: new Date(1_700_000_000_000 + this.clock),
      author: {
        id: input.authorId,
        username: this.usernames.get(input.authorId) ?? '',
      },
    };
    this.rows.set(id, row);
    return row;
  }

  async findById(id: string): Promise<ChatMessageWithAuthor | null> {
    return this.rows.get(id) ?? null;
  }

  async listByRoom(
    roomId: string,
    options: ListMessagesOptions,
  ): Promise<ChatMessageWithAuthor[]> {
    let all = [...this.rows.values()]
      .filter((r) => r.roomId === roomId)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()); // desc
    if (options.before) {
      const cursor = this.rows.get(options.before);
      if (!cursor) return [];
      all = all.filter((r) => r.createdAt.getTime() < cursor.createdAt.getTime());
    }
    return all.slice(0, options.limit);
  }

  async softDelete(id: string, deletedById: string): Promise<ChatMessageWithAuthor> {
    const row = this.rows.get(id);
    if (!row) throw new Error('not found');
    row.isDeleted = true;
    row.deletedAt = new Date();
    row.deletedById = deletedById;
    return row;
  }
}

// --------------------------------------------------------------- helpers ----

function makeUser(id: string, role: UserRole = UserRole.STANDARD): User {
  return {
    id,
    email: `${id}@example.com`,
    username: id,
    passwordHash: 'x',
    role,
    isBanned: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}
const asActor = (u: User): AuthenticatedUser => ({ id: u.id, role: u.role });

function makeRoom(id: string, hostId: string): Room {
  return {
    id,
    name: `Room ${id}`,
    description: null,
    hostId,
    visibility: 'PUBLIC',
    passwordHash: null,
    maxParticipants: 10,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

// ----------------------------------------------------------------- tests ----

describe('ChatService', () => {
  let rooms: StubRoomRepo;
  let messages: InMemoryChatRepo;
  let publisher: RecordingChatEventPublisher;
  let service: ChatService;
  let alice: User; // member
  let bob: User;   // member
  let carol: User; // not a member
  let admin: User;
  const roomId = 'room_1';

  beforeEach(() => {
    rooms = new StubRoomRepo();
    messages = new InMemoryChatRepo();
    publisher = new RecordingChatEventPublisher();
    service = new ChatService(rooms, messages, publisher);

    alice = makeUser('alice');
    bob = makeUser('bob');
    carol = makeUser('carol');
    admin = makeUser('admin', UserRole.SYSTEM_ADMIN);

    messages.registerUser(alice.id, 'alice');
    messages.registerUser(bob.id, 'bob');
    messages.registerUser(carol.id, 'carol');
    messages.registerUser(admin.id, 'admin');

    rooms.setRoom(makeRoom(roomId, alice.id));
    rooms.setActive(roomId, alice.id);
    rooms.setActive(roomId, bob.id);
  });

  describe('sendMessage', () => {
    it('persists, broadcasts, and returns a DTO with author info', async () => {
      const dto = await service.sendMessage(asActor(alice), roomId, 'hello');
      expect(dto.authorUsername).toBe('alice');
      expect(dto.content).toBe('hello');
      expect(dto.isDeleted).toBe(false);
      expect(publisher.events).toHaveLength(1);
      expect(publisher.events[0].type).toBe('new_message');
    });

    it('rejects non-members', async () => {
      await expect(
        service.sendMessage(asActor(carol), roomId, 'sneaky'),
      ).rejects.toThrow(/member/i);
    });

    it('admin can post even without being a member', async () => {
      const dto = await service.sendMessage(asActor(admin), roomId, 'mod note');
      expect(dto.authorUsername).toBe('admin');
    });

    it('rejects empty / whitespace-only messages', async () => {
      await expect(
        service.sendMessage(asActor(alice), roomId, '   '),
      ).rejects.toThrow(/content/i);
    });

    it('rejects over-long content', async () => {
      const longText = 'x'.repeat(2001);
      await expect(
        service.sendMessage(asActor(alice), roomId, longText),
      ).rejects.toThrow(/content/i);
    });

    it('rejects messages to a non-existent room', async () => {
      await expect(
        service.sendMessage(asActor(alice), 'no_such_room', 'hi'),
      ).rejects.toThrow(/room/i);
    });

    it('trims surrounding whitespace before persisting', async () => {
      const dto = await service.sendMessage(asActor(alice), roomId, '  hi  ');
      expect(dto.content).toBe('hi');
    });
  });

  describe('listMessages', () => {
    beforeEach(async () => {
      // Seed 5 messages.
      for (const text of ['m1', 'm2', 'm3', 'm4', 'm5']) {
        await service.sendMessage(asActor(alice), roomId, text);
      }
      publisher.events = []; // reset after seeding so list-tests are isolated
    });

    it('returns the most recent page in ascending chronological order', async () => {
      const result = await service.listMessages(asActor(bob), roomId, { limit: 3 });
      expect(result.messages.map((m) => m.content)).toEqual(['m3', 'm4', 'm5']);
      expect(result.hasMore).toBe(true);
      expect(result.nextCursor).toBe(result.messages[0].id); // oldest in this page
    });

    it('returns the full set when limit exceeds total', async () => {
      const result = await service.listMessages(asActor(bob), roomId, { limit: 50 });
      expect(result.messages.map((m) => m.content)).toEqual(['m1', 'm2', 'm3', 'm4', 'm5']);
      expect(result.hasMore).toBe(false);
      expect(result.nextCursor).toBeNull();
    });

    it('paginates older messages via nextCursor', async () => {
      const page1 = await service.listMessages(asActor(bob), roomId, { limit: 2 });
      expect(page1.messages.map((m) => m.content)).toEqual(['m4', 'm5']);
      expect(page1.hasMore).toBe(true);

      const page2 = await service.listMessages(asActor(bob), roomId, {
        limit: 2,
        before: page1.nextCursor!,
      });
      expect(page2.messages.map((m) => m.content)).toEqual(['m2', 'm3']);
      expect(page2.hasMore).toBe(true);

      const page3 = await service.listMessages(asActor(bob), roomId, {
        limit: 2,
        before: page2.nextCursor!,
      });
      expect(page3.messages.map((m) => m.content)).toEqual(['m1']);
      expect(page3.hasMore).toBe(false);
      expect(page3.nextCursor).toBeNull();
    });

    it('rejects an invalid cursor with 400', async () => {
      await expect(
        service.listMessages(asActor(bob), roomId, {
          limit: 10,
          before: 'msg_does_not_exist',
        }),
      ).rejects.toThrow(/cursor/i);
    });

    it('rejects non-members', async () => {
      await expect(
        service.listMessages(asActor(carol), roomId, { limit: 10 }),
      ).rejects.toThrow(/member/i);
    });

    it('admin can list history without being a member', async () => {
      const result = await service.listMessages(asActor(admin), roomId, { limit: 50 });
      expect(result.messages).toHaveLength(5);
    });
  });

  describe('deleteMessage', () => {
    it('author can soft-delete their own message; content is redacted in the DTO', async () => {
      const msg = await service.sendMessage(asActor(alice), roomId, 'oops');
      publisher.events = [];

      await service.deleteMessage(asActor(alice), msg.id);

      const page = await service.listMessages(asActor(bob), roomId, { limit: 50 });
      const found = page.messages.find((m) => m.id === msg.id)!;
      expect(found.isDeleted).toBe(true);
      expect(found.content).toBe(''); // redacted
      expect(found.deletedByUserId).toBe(alice.id);

      expect(publisher.events).toEqual([
        expect.objectContaining({ type: 'message_deleted' }),
      ]);
    });

    it('admin can delete any message', async () => {
      const msg = await service.sendMessage(asActor(bob), roomId, 'troll');
      await service.deleteMessage(asActor(admin), msg.id);
      const after = await messages.findById(msg.id);
      expect(after!.isDeleted).toBe(true);
      expect(after!.deletedById).toBe(admin.id);
    });

    it('non-author non-admin cannot delete', async () => {
      const msg = await service.sendMessage(asActor(alice), roomId, 'mine');
      await expect(
        service.deleteMessage(asActor(bob), msg.id),
      ).rejects.toThrow(/delete/i);
    });

    it('returns 404 for a missing message', async () => {
      await expect(
        service.deleteMessage(asActor(alice), 'msg_nope'),
      ).rejects.toThrow(/not found/i);
    });

    it('second delete is a no-op (idempotent — no extra event)', async () => {
      const msg = await service.sendMessage(asActor(alice), roomId, 'twice');
      publisher.events = [];

      await service.deleteMessage(asActor(alice), msg.id);
      const eventsAfterFirst = publisher.events.length;

      await service.deleteMessage(asActor(alice), msg.id);
      expect(publisher.events.length).toBe(eventsAfterFirst);
    });
  });
});
