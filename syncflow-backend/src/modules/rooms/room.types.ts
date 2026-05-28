import { RoomVisibility } from '@prisma/client';

/**
 * RoomLifecycleListener — an in-process hook for other modules to react
 * to room-level lifecycle events without circular service dependencies.
 * Currently only the timer module subscribes (to drop in-memory state
 * when a room disappears), but chat/media will use the same surface.
 */
export interface RoomLifecycleListener {
  onRoomDeleted?(roomId: string): void | Promise<void>;
}

/**
 * RoomSummary — the shape returned in listings. Never includes passwordHash;
 * exposes `hasPassword: boolean` so clients know whether to prompt.
 */
export interface RoomSummary {
  id: string;
  name: string;
  description: string | null;
  hostId: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  maxParticipants: number;
  memberCount: number;
  createdAt: string; // ISO-8601
}

export interface MemberDTO {
  userId: string;
  username: string;
  isHost: boolean;
  joinedAt: string; // ISO-8601
}

export interface RoomDetails extends RoomSummary {
  members: MemberDTO[];
}

export interface PagedRoomsDTO {
  items: RoomSummary[];
  total: number;
  page: number;
  pageSize: number;
}
