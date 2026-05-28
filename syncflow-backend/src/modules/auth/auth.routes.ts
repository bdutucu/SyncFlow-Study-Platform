import { Router } from 'express';
import { AuthController } from './auth.controller';
import { requireAuth } from './auth.middleware';

export function buildAuthRouter(controller: AuthController): Router {
  const router = Router();

  // Public endpoints
  router.post('/register', controller.register);
  router.post('/login', controller.login);
  router.post('/refresh', controller.refresh);

  // Protected endpoints
  router.get('/me', requireAuth, controller.me);

  return router;
}
