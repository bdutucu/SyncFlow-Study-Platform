import { UserRole } from '@prisma/client';
import { Clock } from '../../shared/clock';
import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { MediaState } from './media.types';
import { IMediaStore, initialState } from './media.store';
import { IMediaEventPublisher } from './media.events';
import { extractYouTubeVideoId } from './media.url';
import {
  MediaHostActionForbiddenError,
  MediaNotMemberError,
  MediaRoomNotFoundError,
  MediaInvalidUrlError,
  MediaNoVideoLoadedError,
} from './media.errors';

/**
 * MediaService — Media Sync component (DSD §3.2.5).
 *
 * The host loads a YouTube URL into the room's shared player and
 * controls playback for everyone. The server is authoritative for the
 * "currently loaded video + current position" state; clients render
 * locally by computing position from the absolute timestamps in
 * MediaState (same trick as the timer module — no per-second ticks).
 *
 * Authorization:
 *   • Read state: any active member, or any SYSTEM_ADMIN.
 *   • Write (load / play / pause / seek / unload): host of the room
 *     or SYSTEM_ADMIN. Same gating policy as the timer (DSD §3.2.3,
 *     §3.2.6).
 *
 * Supported provider: YouTube (URL forms covered in
 * extractYouTubeVideoId). Non-YouTube URLs reject with
 * MEDIA_INVALID_URL. Adding another provider would mean introducing a
 * `provider` field on MediaState plus a parser dispatch.
 */
export class MediaService {
  constructor(
    private readonly rooms: IRoomRepository,
    private readonly store: IMediaStore,
    private readonly publisher: IMediaEventPublisher,
    private readonly clock: Clock,
  ) {}

  // -------------------------------------------------------- public API ----

  async getState(actor: AuthenticatedUser, roomId: string): Promise<MediaState> {
    await this.requireMembership(actor, roomId);
    return this.store.getOrInit(roomId);
  }

  async load(
    actor: AuthenticatedUser,
    roomId: string,
    url: string,
    startAtMs: number | undefined,
  ): Promise<MediaState> {
    await this.requireHost(actor, roomId);

    const videoId = extractYouTubeVideoId(url);
    if (videoId === null) throw new MediaInvalidUrlError();

    const now = this.clock.now();
    const next: MediaState = {
      roomId,
      status: 'PAUSED', // loaded but not yet playing
      videoUrl: url,
      videoId,
      playbackPositionMs: startAtMs ?? 0,
      positionUpdatedAt: null,
      loadedByUserId: actor.id,
      loadedAt: now,
    };
    this.commit(next);
    return next;
  }

  async unload(actor: AuthenticatedUser, roomId: string): Promise<MediaState> {
    await this.requireHost(actor, roomId);
    const next = initialState(roomId);
    this.commit(next);
    return next;
  }

  async play(actor: AuthenticatedUser, roomId: string): Promise<MediaState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    if (state.status === 'IDLE') throw new MediaNoVideoLoadedError();
    if (state.status === 'PLAYING') return state; // idempotent

    // From PAUSED → PLAYING. playbackPositionMs is the "where we were"
    // marker; we start measuring elapsed from now.
    const next: MediaState = {
      ...state,
      status: 'PLAYING',
      positionUpdatedAt: this.clock.now(),
    };
    this.commit(next);
    return next;
  }

  async pause(actor: AuthenticatedUser, roomId: string): Promise<MediaState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    if (state.status === 'IDLE') throw new MediaNoVideoLoadedError();
    if (state.status === 'PAUSED') return state; // idempotent

    const now = this.clock.now();
    const elapsed =
      state.positionUpdatedAt !== null ? now - state.positionUpdatedAt : 0;
    const next: MediaState = {
      ...state,
      status: 'PAUSED',
      playbackPositionMs: state.playbackPositionMs + elapsed,
      positionUpdatedAt: null,
    };
    this.commit(next);
    return next;
  }

  /**
   * Seek to an absolute position in the loaded video.
   *   • When PLAYING:  positionUpdatedAt resets to now so the new
   *     position becomes the anchor for client-side computation.
   *   • When PAUSED:   playbackPositionMs is just overwritten; the
   *     server stays paused at the new position.
   */
  async seek(
    actor: AuthenticatedUser,
    roomId: string,
    positionMs: number,
  ): Promise<MediaState> {
    await this.requireHost(actor, roomId);
    const state = this.store.getOrInit(roomId);
    if (state.status === 'IDLE') throw new MediaNoVideoLoadedError();

    const next: MediaState = {
      ...state,
      playbackPositionMs: positionMs,
      positionUpdatedAt: state.status === 'PLAYING' ? this.clock.now() : null,
    };
    this.commit(next);
    return next;
  }

  /** Called by RoomService lifecycle hooks when the room is deleted. */
  cleanupRoom(roomId: string): void {
    this.store.delete(roomId);
  }

  // ------------------------------------------------------ private bits ----

  private commit(state: MediaState): void {
    this.store.set(state);
    this.publisher.stateChanged(state);
  }

  private async requireHost(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new MediaRoomNotFoundError();
    const isAdmin = actor.role === UserRole.SYSTEM_ADMIN;
    if (room.hostId !== actor.id && !isAdmin) {
      throw new MediaHostActionForbiddenError();
    }
  }

  private async requireMembership(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<void> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new MediaRoomNotFoundError();
    if (actor.role === UserRole.SYSTEM_ADMIN || room.hostId === actor.id) return;
    const m = await this.rooms.findMembership(actor.id, roomId);
    if (!m || m.status !== 'ACTIVE') throw new MediaNotMemberError();
  }
}
