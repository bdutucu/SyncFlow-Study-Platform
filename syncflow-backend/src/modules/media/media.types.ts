export type MediaStatus = 'IDLE' | 'PAUSED' | 'PLAYING';

/**
 * MediaState — the canonical, server-authoritative state for one room's
 * shared video player (DSD §3.2.5).
 *
 * Mirrors the time-tracking pattern from TimerState so the engine can
 * stay event-driven (no per-second server ticks). Clients render
 * playback position locally:
 *
 *   if status == PLAYING:
 *     position = playbackPositionMs + (Date.now() - positionUpdatedAt)
 *   else (PAUSED or IDLE):
 *     position = playbackPositionMs
 *
 * The server emits a `media:state_changed` event on every transition
 * (load, play, pause, seek, unload) so clients can re-sync their
 * embedded YouTube player.
 *
 * Lifetime: in-memory, like the timer (DSD §3.2.3). Process restart
 * drops loaded videos back to IDLE — host re-loads.
 */
export interface MediaState {
  roomId: string;
  status: MediaStatus;

  // Video identity. Only the YouTube provider is supported in this
  // slice; videoId is the 11-char id extracted by extractYouTubeVideoId.
  // A future provider field could broaden this.
  videoUrl: string | null;
  videoId: string | null;

  // Playback tracking (epoch ms).
  playbackPositionMs: number;
  positionUpdatedAt: number | null;

  // Audit: who loaded the current video, and when.
  loadedByUserId: string | null;
  loadedAt: number | null;
}

/** Wire shape sent on `media:state_changed`. Identical to MediaState. */
export type MediaStateDTO = MediaState;
