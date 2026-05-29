import { Router } from 'express';
import { RoomController } from './room.controller';
import { requireAuth } from '../auth/auth.middleware';

/**
 * All room endpoints require authentication. Authorization (host vs. member
 * vs. admin) is enforced inside the service so that a single source of
 * truth governs both REST and any future internal callers.
 */
export function buildRoomRouter(controller: RoomController): Router {
  const router = Router();

  router.use(requireAuth);

  // Browse / read
  router.get('/', controller.listPublic);
  router.get('/me/active', controller.myActive);  // MUST precede /:id
  router.get('/:id', controller.getOne);
  router.get('/:id/members', controller.listMembers);

  // Lifecycle
  router.post('/', controller.create);
  router.patch('/:id', controller.update);
  router.delete('/:id', controller.remove);

  // Membership
  router.post('/:id/join', controller.join);
  router.post('/:id/leave', controller.leave);
  router.delete('/:id/members/:userId', controller.kick);

  return router;
}
