import {
  Room,
  RoomMembership,
  RoomVisibility,
  MembershipStatus,
} from '@prisma/client';

export interface CreateRoomData {
  name: string;
  description: string | null;
  hostId: string;
  visibility: RoomVisibility;
  passwordHash: string | null;
  maxParticipants: number;
}

export interface UpdateRoomData {
  name?: string;
  description?: string | null;
  visibility?: RoomVisibility;
  passwordHash?: string | null;
  maxParticipants?: number;
}

export interface ListPublicOptions {
  page: number;     // 1-indexed
  pageSize: number; // capped by service layer
  search?: string;
}

/** Room enriched with the count of currently-active members. */
export interface RoomWithMemberCount extends Room {
  memberCount: number;
}

export interface PagedRooms {
  items: RoomWithMemberCount[];
  total: number;
  page: number;
  pageSize: number;
}

export interface MemberInfo {
  userId: string;
  username: string;
  joinedAt: Date;
}

/**
 * IRoomRepository — persistence surface for the Room Management component
 * (DSD §3.2.2, §3.5.8).
 *
 * Membership operations are exposed alongside room CRUD because they share
 * transactional concerns (creating a room atomically writes the host's
 * ACTIVE membership; leaving may delete the room).
 */
export interface IRoomRepository {
  // ---- Room CRUD ----
  /** Creates the room AND the host's ACTIVE membership in one transaction. */
  createWithHostMembership(data: CreateRoomData): Promise<Room>;
  findById(id: string): Promise<Room | null>;
  listPublic(options: ListPublicOptions): Promise<PagedRooms>;
  update(id: string, patch: UpdateRoomData): Promise<Room>;
  delete(id: string): Promise<void>;
  transferHost(roomId: string, newHostId: string): Promise<Room>;

  // ---- Membership ----
  findMembership(userId: string, roomId: string): Promise<RoomMembership | null>;
  findActiveMembershipByUser(userId: string): Promise<RoomMembership | null>;
  listActiveMembers(roomId: string): Promise<MemberInfo[]>;
  countActiveMembers(roomId: string): Promise<number>;
  /** Upserts to ACTIVE on (re)join; resets joinedAt to now. */
  activateMembership(userId: string, roomId: string): Promise<RoomMembership>;
  /** Marks the membership as LEFT or KICKED, stamps leftAt=now. */
  closeMembership(
    userId: string,
    roomId: string,
    status: Extract<MembershipStatus, 'LEFT' | 'KICKED'>,
  ): Promise<RoomMembership>;
}
