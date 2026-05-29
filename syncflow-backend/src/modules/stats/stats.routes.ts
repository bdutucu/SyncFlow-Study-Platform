import { Router } from 'express';
import { StatsController } from './stats.controller';
import { requireAuth } from '../auth/auth.middleware';

/**
 * Stats router. Mounted at /api/stats.
 *
 *   GET /api/stats/me                              → MyStatsDTO
 *   GET /api/stats/leaderboard?period=all|week|month → LeaderboardDTO
 *
 * Both endpoints are read-only and JWT-authenticated. The leaderboard
 * exposes only user-chosen public data (username + WORK totals); no
 * email, no role, no presence.
 */
export function buildStatsRouter(controller: StatsController): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/me', controller.me);
  router.get('/leaderboard', controller.leaderboard);

  return router;
}
