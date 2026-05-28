/**
 * Voice token DTO (DSD §3.5.6, DL-01).
 *
 * Issued by the SYNCFLOW backend so the client can join an Agora RTC
 * channel scoped to a specific room. Audio bytes never traverse our
 * server — the client uses these credentials to connect directly to
 * Agora Cloud.
 *
 * Why the server mints the token rather than the client holding a
 * static app credential: the server enforces that only an active
 * member of the room may receive a token for that room. The token is
 * short-lived (1 hour by default) so a leaked token cannot indefinitely
 * impersonate a participant.
 */
export interface VoiceTokenDTO {
  /** Agora App ID — public; the client SDK needs it. */
  appId: string;
  /** The channel name. We use the roomId so the audio room maps 1:1 to a study room. */
  channel: string;
  /** Stable numeric UID derived from the user id (Agora requires uint32). */
  uid: number;
  /** Short-lived RTC token. `null` in dev mode when no AGORA_APP_CERTIFICATE is set. */
  token: string | null;
  /** ISO timestamp at which `token` stops being valid. */
  expiresAt: string;
}

/** Strategy interface — keeps the route thin and lets us mock in tests. */
export interface IVoiceTokenIssuer {
  issue(userId: string, roomId: string): Promise<VoiceTokenDTO>;
}
