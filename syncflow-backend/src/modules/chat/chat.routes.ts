import { Router } from 'express';
import { ChatController } from './chat.controller';
import { requireAuth } from '../auth/auth.middleware';

/**
 * Chat REST router. Mounted at `/api`, so the full paths become:
 *
 *   GET    /api/rooms/:roomId/messages?before=<msgId>&limit=<n>
 *   DELETE /api/messages/:id
 *
 * Sending a new message is socket-only (`chat:send_message`) — see
 * chat.socket.ts. REST handles the slower-path concerns: history
 * fetching for cold loads / infinite scroll, and moderation deletes.
 */
export function buildChatRouter(controller: ChatController): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/rooms/:roomId/messages', controller.list);
  router.delete('/messages/:id', controller.remove);

  return router;
}
