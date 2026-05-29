import { Request, Response, NextFunction } from 'express';
import { StatsService } from './stats.service';
import { AuthenticatedUser } from '../auth/auth.types';
import { LeaderboardPeriod } from '../../repositories/interfaces/IFocusStatRepository';

function actor(req: Request): AuthenticatedUser {
  return req.user!;
}

function parsePeriod(raw: unknown): LeaderboardPeriod {
  return raw === 'week' || raw === 'month' ? raw : 'all';
}

export class StatsController {
  constructor(private readonly service: StatsService) {}

  me = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = await this.service.getMine(actor(req));
      res.status(200).json(dto);
    } catch (err) {
      next(err);
    }
  };

  leaderboard = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const period = parsePeriod(req.query.period);
      const dto = await this.service.getLeaderboard(actor(req), period);
      res.status(200).json(dto);
    } catch (err) {
      next(err);
    }
  };
}
