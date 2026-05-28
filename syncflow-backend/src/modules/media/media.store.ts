import { MediaState } from './media.types';

/**
 * IMediaStore — keyed by roomId. Returns null for rooms with no
 * activity; callers should use getOrInit() to create-on-demand.
 *
 * Production impl is in-memory and intentionally ephemeral (DSD §3.2.5
 * — media state is recoverable; the host can re-load on restart).
 * A Redis-backed implementation could be dropped in behind this
 * interface if cross-instance sync is required later.
 */
export interface IMediaStore {
  get(roomId: string): MediaState | null;
  getOrInit(roomId: string): MediaState;
  set(state: MediaState): void;
  delete(roomId: string): void;
}

export class InMemoryMediaStore implements IMediaStore {
  private states = new Map<string, MediaState>();

  get(roomId: string): MediaState | null {
    return this.states.get(roomId) ?? null;
  }

  getOrInit(roomId: string): MediaState {
    const existing = this.states.get(roomId);
    if (existing) return existing;
    const fresh = initialState(roomId);
    this.states.set(roomId, fresh);
    return fresh;
  }

  set(state: MediaState): void {
    this.states.set(state.roomId, state);
  }

  delete(roomId: string): void {
    this.states.delete(roomId);
  }
}

/** A blank IDLE state — no video loaded, no playback. */
export function initialState(roomId: string): MediaState {
  return {
    roomId,
    status: 'IDLE',
    videoUrl: null,
    videoId: null,
    playbackPositionMs: 0,
    positionUpdatedAt: null,
    loadedByUserId: null,
    loadedAt: null,
  };
}

export const inMemoryMediaStore = new InMemoryMediaStore();
