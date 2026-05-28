export type UserRole = 'STANDARD' | 'SYSTEM_ADMIN';

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

export type RoomVisibility = 'PUBLIC' | 'PRIVATE';

export interface RoomSummary {
  id: string;
  name: string;
  description: string | null;
  hostId: string;
  visibility: RoomVisibility;
  hasPassword: boolean;
  maxParticipants: number;
  memberCount: number;
  createdAt: string;
}

export interface MemberDTO {
  userId: string;
  username: string;
  isHost: boolean;
  joinedAt: string;
}

export interface RoomDetails extends RoomSummary {
  members: MemberDTO[];
}

export interface PagedRooms {
  items: RoomSummary[];
  total: number;
  page: number;
  pageSize: number;
}

export type TimerPhase = 'WORK' | 'SHORT_BREAK' | 'LONG_BREAK';
export type TimerStatus = 'IDLE' | 'RUNNING' | 'PAUSED';

export interface TimerConfig {
  workDurationMs: number;
  shortBreakDurationMs: number;
  longBreakDurationMs: number;
  cyclesBeforeLongBreak: number;
  autoAdvance: boolean;
}

export interface TimerState {
  roomId: string;
  status: TimerStatus;
  phase: TimerPhase;
  phaseStartedAt: number | null;
  pausedAt: number | null;
  accumulatedMs: number;
  phaseDurationMs: number;
  completedWorkCycles: number;
  config: TimerConfig;
}

export type MediaStatus = 'IDLE' | 'PAUSED' | 'PLAYING';

export interface MediaState {
  roomId: string;
  status: MediaStatus;
  videoUrl: string | null;
  videoId: string | null;
  playbackPositionMs: number;
  positionUpdatedAt: number | null;
  loadedByUserId: string | null;
  loadedAt: number | null;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  isDeleted: boolean;
  deletedByUserId: string | null;
  createdAt: string;
}

export interface AdminUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
  isBanned: boolean;
  createdAt: string;
}

export interface PagedAdminUsers {
  items: AdminUser[];
  total: number;
  page: number;
  pageSize: number;
}
