import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { AdminController } from './admin.controller';
import { requireAuth, requireRole } from '../auth/auth.middleware';

/**
 * Admin router (DSD §3.2.6). Mounted at /api/admin.
 *
 * Every route enforces SYSTEM_ADMIN at the router level via
 * requireRole, even though AdminService re-checks internally. This is
 * deliberate defence-in-depth: route-level gating means a misconfigured
 * service composition cannot accidentally expose an admin endpoint as
 * public.
 */
export function buildAdminRouter(controller: AdminController): Router {
  const router = Router();
  router.use(requireAuth);
  router.use(requireRole(UserRole.SYSTEM_ADMIN));

  router.get('/users', controller.listUsers);
  router.post('/users/:userId/ban', controller.ban);
  router.post('/users/:userId/unban', controller.unban);
  router.get('/users/:userId/bans', controller.banHistory);

  return router;
}
