import crypto from 'crypto';
import { IVoiceTokenIssuer, VoiceTokenDTO } from './voice.types';

const TOKEN_TTL_SECONDS = 60 * 60; // 1 hour

/**
 * AgoraVoiceTokenIssuer — DSD §3.5.6 / DL-01.
 *
 * Production behaviour: with AGORA_APP_ID and AGORA_APP_CERTIFICATE
 * configured, this issues a real RtcTokenBuilder token. Currently we
 * lazy-load `agora-token` only if both env vars are present, so the
 * project still installs and runs without the SDK.
 *
 * Dev fallback (when AGORA_APP_CERTIFICATE is unset): we return the
 * App ID + channel + uid but no token. The Agora SDK accepts a null
 * token in App ID auth mode (an Agora project setting). This keeps the
 * full client→server→Agora handshake testable in development without
 * forcing a paid project.
 *
 * We derive a deterministic 32-bit UID from the user UUID so a single
 * Agora channel never has two seats for the same user.
 */
export class AgoraVoiceTokenIssuer implements IVoiceTokenIssuer {
  constructor(
    private readonly appId: string | undefined,
    private readonly appCertificate: string | undefined,
  ) {}

  async issue(userId: string, roomId: string): Promise<VoiceTokenDTO> {
    const appId = this.appId ?? '';
    const channel = roomId;
    const uid = deriveUid(userId);
    const expiresAtSec = Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS;

    let token: string | null = null;
    if (appId && this.appCertificate) {
      try {
        // Lazy import so the package is optional.
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { RtcTokenBuilder, RtcRole } = require('agora-token');
        token = RtcTokenBuilder.buildTokenWithUid(
          appId,
          this.appCertificate,
          channel,
          uid,
          RtcRole.PUBLISHER,
          expiresAtSec,
          expiresAtSec,
        );
      } catch (err) {
        // Package missing or build failed — fall through with null token.
        // eslint-disable-next-line no-console
        console.warn('[voice] agora-token unavailable, returning null token:', err);
      }
    }

    return {
      appId,
      channel,
      uid,
      token,
      expiresAt: new Date(expiresAtSec * 1000).toISOString(),
    };
  }
}

/** Map a UUID to a stable 32-bit unsigned int for Agora. */
function deriveUid(userId: string): number {
  const hash = crypto.createHash('sha256').update(userId).digest();
  // Read the first 4 bytes as an unsigned int, then clamp into Agora's
  // valid range (1 .. 2^32 - 1; 0 is reserved by Agora to mean "assign").
  const n = hash.readUInt32BE(0);
  return n === 0 ? 1 : n;
}
