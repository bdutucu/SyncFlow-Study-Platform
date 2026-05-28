import { Router } from 'express';
import { VoiceController } from './voice.controller';
import { requireAuth } from '../auth/auth.middleware';

/**
 * Voice routes (DSD §3.5.6, DL-01). Mounted at /api/voice.
 *
 * Single endpoint: a per-room token issuance call. The token is
 * short-lived and bound to (room, user) — the client uses it to join an
 * Agora RTC channel directly. Audio never traverses the SYNCFLOW server.
 *
 *   POST /api/voice/rooms/:roomId/token  →  VoiceTokenDTO
 */
export function buildVoiceRouter(controller: VoiceController): Router {
  const router = Router();
  router.use(requireAuth);

  router.post('/rooms/:roomId/token', controller.token);

  return router;
}
