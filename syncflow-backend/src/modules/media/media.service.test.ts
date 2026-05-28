import {
  Room,
  RoomMembership,
  User,
  UserRole,
} from '@prisma/client';
import { Clock } from '../../shared/clock';
import {
  IRoomRepository,
  CreateRoomData,
  UpdateRoomData,
  ListPublicOptions,
  PagedRooms,
  MemberInfo,
} from '../../repositories/interfaces/IRoomRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { MediaService } from './media.service';
import { InMemoryMediaStore } from './media.store';
import { RecordingMediaEventPublisher } from './media.events';
import { extractYouTubeVideoId } from './media.url';

// ---------------------------------------------------------------- fakes ----

class ManualClock implements Clock {
  constructor(private t = 1_700_000_000_000) {}
  now() { return this.t; }
  advance(ms: number) { this.t += ms; }
}

class StubRoomRepo implements IRoomRepository {
  rooms = new Map<string, Room>();
  memberships = new Map<string, RoomMembership>();
  key(u: string, r: string) { return `${u}|${r}`; }

  setRoom(room: Room) { this.rooms.set(room.id, room); }
  setMembership(userId: string, roomId: string) {
    this.memberships.set(this.key(userId, roomId), {
      id: `m_${this.memberships.size + 1}`,
      userId, roomId, status: 'ACTIVE',
      joinedAt: new Date(), leftAt: null,
    });
  }

  async findById(id: string) { return this.rooms.get(id) ?? null; }
  async findMembership(userId: string, roomId: string) {
    return this.memberships.get(this.key(userId, roomId)) ?? null;
  }
  async listActiveMembers(_: string): Promise<MemberInfo[]> { return []; }

  // unused stubs
  async createWithHostMembership(_: CreateRoomData): Promise<Room> { throw new Error('n/a'); }
  async listPublic(_: ListPublicOptions): Promise<PagedRooms> { throw new Error('n/a'); }
  async update(_: string, __: UpdateRoomData): Promise<Room> { throw new Error('n/a'); }
  async delete(_: string): Promise<void> { /* noop */ }
  async transferHost(_: string, __: string): Promise<Room> { throw new Error('n/a'); }
  async findActiveMembershipByUser(_: string) { return null; }
  async countActiveMembers(_: string) { return 0; }
  async activateMembership(_: string, __: string) { throw new Error('n/a'); }
  async closeMembership(_: string, __: string, ___: 'LEFT' | 'KICKED') { throw new Error('n/a'); }
}

function makeUser(id: string, role: UserRole = UserRole.STANDARD): User {
  return {
    id, email: `${id}@x.com`, username: id, passwordHash: 'x',
    role, isBanned: false, createdAt: new Date(), updatedAt: new Date(),
  };
}
function makeRoom(id: string, hostId: string): Room {
  return {
    id, name: `Room ${id}`, description: null, hostId,
    visibility: 'PUBLIC', passwordHash: null, maxParticipants: 10,
    createdAt: new Date(), updatedAt: new Date(),
  };
}
const asActor = (u: User): AuthenticatedUser => ({ id: u.id, role: u.role });

const RICK = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';
const RICK_ID = 'dQw4w9WgXcQ';

// ----------------------------------------------------------------- tests ----

describe('extractYouTubeVideoId', () => {
  it.each([
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://m.youtube.com/watch?v=dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s', 'dQw4w9WgXcQ'],
    ['https://youtu.be/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/embed/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/v/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
    ['https://www.youtube.com/shorts/dQw4w9WgXcQ', 'dQw4w9WgXcQ'],
  ])('parses %s', (url, expected) => {
    expect(extractYouTubeVideoId(url)).toBe(expected);
  });

  it.each([
    'https://vimeo.com/123',
    'not-a-url',
    'https://www.youtube.com/',
    'https://www.youtube.com/watch?v=short',
    'https://www.youtube.com/watch?v=way-too-long-for-an-id',
    'ftp://www.youtube.com/watch?v=dQw4w9WgXcQ',
  ])('rejects %s', (url) => {
    expect(extractYouTubeVideoId(url)).toBeNull();
  });
});

describe('MediaService', () => {
  let clock: ManualClock;
  let store: InMemoryMediaStore;
  let publisher: RecordingMediaEventPublisher;
  let rooms: StubRoomRepo;
  let service: MediaService;

  let alice: User; // host
  let bob: User;   // member
  let carol: User; // not a member
  let admin: User;
  const roomId = 'room_1';

  beforeEach(() => {
    clock = new ManualClock();
    store = new InMemoryMediaStore();
    publisher = new RecordingMediaEventPublisher();
    rooms = new StubRoomRepo();

    alice = makeUser('alice');
    bob = makeUser('bob');
    carol = makeUser('carol');
    admin = makeUser('admin', UserRole.SYSTEM_ADMIN);

    rooms.setRoom(makeRoom(roomId, alice.id));
    rooms.setMembership(alice.id, roomId);
    rooms.setMembership(bob.id, roomId);

    service = new MediaService(rooms, store, publisher, clock);
  });

  describe('authorization', () => {
    it('any member can read state', async () => {
      const state = await service.getState(asActor(bob), roomId);
      expect(state.status).toBe('IDLE');
    });

    it('non-member is rejected on read', async () => {
      await expect(service.getState(asActor(carol), roomId))
        .rejects.toThrow(/member/i);
    });

    it('admin can read any room', async () => {
      const state = await service.getState(asActor(admin), roomId);
      expect(state.roomId).toBe(roomId);
    });

    it('non-host cannot load', async () => {
      await expect(service.load(asActor(bob), roomId, RICK, undefined))
        .rejects.toThrow(/host/i);
    });

    it('admin can act as host', async () => {
      const state = await service.load(asActor(admin), roomId, RICK, undefined);
      expect(state.videoId).toBe(RICK_ID);
    });
  });

  describe('load / unload', () => {
    it('loads a valid YouTube URL into PAUSED state at position 0', async () => {
      const state = await service.load(asActor(alice), roomId, RICK, undefined);
      expect(state.status).toBe('PAUSED');
      expect(state.videoUrl).toBe(RICK);
      expect(state.videoId).toBe(RICK_ID);
      expect(state.playbackPositionMs).toBe(0);
      expect(state.loadedByUserId).toBe(alice.id);
      expect(publisher.events).toContainEqual(
        expect.objectContaining({ type: 'state_changed' }),
      );
    });

    it('accepts startAtMs to seed the initial position', async () => {
      const state = await service.load(asActor(alice), roomId, RICK, 60_000);
      expect(state.playbackPositionMs).toBe(60_000);
    });

    it('rejects an unsupported URL', async () => {
      await expect(
        service.load(asActor(alice), roomId, 'https://vimeo.com/abc', undefined),
      ).rejects.toThrow(/url/i);
    });

    it('unload returns to a blank IDLE state', async () => {
      await service.load(asActor(alice), roomId, RICK, undefined);
      const state = await service.unload(asActor(alice), roomId);
      expect(state.status).toBe('IDLE');
      expect(state.videoUrl).toBeNull();
      expect(state.videoId).toBeNull();
      expect(state.playbackPositionMs).toBe(0);
    });
  });

  describe('play / pause', () => {
    beforeEach(async () => {
      await service.load(asActor(alice), roomId, RICK, undefined);
      publisher.events = []; // reset so play/pause tests assert only their own events
    });

    it('play moves PAUSED → PLAYING and stamps positionUpdatedAt', async () => {
      const before = clock.now();
      const state = await service.play(asActor(alice), roomId);
      expect(state.status).toBe('PLAYING');
      expect(state.positionUpdatedAt).toBe(before);
    });

    it('play on IDLE rejects (no video)', async () => {
      await service.unload(asActor(alice), roomId);
      await expect(service.play(asActor(alice), roomId)).rejects.toThrow(/video/i);
    });

    it('play is idempotent when already PLAYING', async () => {
      await service.play(asActor(alice), roomId);
      publisher.events = [];
      const state = await service.play(asActor(alice), roomId);
      expect(state.status).toBe('PLAYING');
      expect(publisher.events).toEqual([]); // no event emitted
    });

    it('pause accumulates the elapsed playback time', async () => {
      await service.play(asActor(alice), roomId);
      clock.advance(45_000); // 45 seconds of playback
      const state = await service.pause(asActor(alice), roomId);
      expect(state.status).toBe('PAUSED');
      expect(state.playbackPositionMs).toBe(45_000);
      expect(state.positionUpdatedAt).toBeNull();
    });

    it('pause is idempotent when already PAUSED', async () => {
      const before = await service.pause(asActor(alice), roomId);
      publisher.events = [];
      const after = await service.pause(asActor(alice), roomId);
      expect(after.playbackPositionMs).toBe(before.playbackPositionMs);
      expect(publisher.events).toEqual([]);
    });

    it('subsequent play after a pause uses the accumulated position', async () => {
      await service.play(asActor(alice), roomId);
      clock.advance(10_000);
      await service.pause(asActor(alice), roomId);

      clock.advance(60_000);              // 60s of pause that should NOT count
      const resumed = await service.play(asActor(alice), roomId);
      expect(resumed.playbackPositionMs).toBe(10_000);
      expect(resumed.positionUpdatedAt).toBe(clock.now());
    });
  });

  describe('seek', () => {
    beforeEach(async () => {
      await service.load(asActor(alice), roomId, RICK, undefined);
    });

    it('seek while PAUSED just updates the position', async () => {
      const state = await service.seek(asActor(alice), roomId, 90_000);
      expect(state.status).toBe('PAUSED');
      expect(state.playbackPositionMs).toBe(90_000);
      expect(state.positionUpdatedAt).toBeNull();
    });

    it('seek while PLAYING re-anchors positionUpdatedAt to now', async () => {
      await service.play(asActor(alice), roomId);
      clock.advance(5_000);
      const seekAt = clock.now();
      const state = await service.seek(asActor(alice), roomId, 200_000);
      expect(state.status).toBe('PLAYING');
      expect(state.playbackPositionMs).toBe(200_000);
      expect(state.positionUpdatedAt).toBe(seekAt);
    });

    it('seek on IDLE rejects', async () => {
      await service.unload(asActor(alice), roomId);
      await expect(
        service.seek(asActor(alice), roomId, 1000),
      ).rejects.toThrow(/video/i);
    });

    it('non-host cannot seek', async () => {
      await expect(
        service.seek(asActor(bob), roomId, 1000),
      ).rejects.toThrow(/host/i);
    });
  });

  describe('cleanupRoom', () => {
    it('drops state when a room is deleted', async () => {
      await service.load(asActor(alice), roomId, RICK, undefined);
      service.cleanupRoom(roomId);
      expect(store.get(roomId)).toBeNull();
    });
  });
});
