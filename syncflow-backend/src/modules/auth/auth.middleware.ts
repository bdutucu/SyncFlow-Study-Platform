import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { verifyAccessToken } from '../../shared/jwt';
import {
  MissingAuthHeaderError,
  InvalidOrExpiredTokenError,
  InsufficientRoleError,
} from './auth.errors';

/**
 * Express middleware that gates protected REST endpoints. On success it
 * attaches `req.user = { id, role }`.
 *
 * Implementation note: this middleware deliberately does NOT hit the
 * database. DSD §3.5.5 accepts a bounded staleness window (the JWT TTL of
 * 15 minutes) in exchange for keeping the REST hot path cheap. Live ban
 * enforcement happens on:
 *   • refresh-token exchange (AuthService.refresh)
 *   • Socket.IO connection (see auth.socket.ts)
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;
  if (!header || !header.startsWith('Bearer ')) {
    return next(new MissingAuthHeaderError());
  }

  const token = header.slice('Bearer '.length).trim();
  if (!token) {
    return next(new MissingAuthHeaderError());
  }

  try {
    const payload = verifyAccessToken(token);
    req.user = { id: payload.sub, role: payload.role };
    next();
  } catch {
    next(new InvalidOrExpiredTokenError());
  }
}

/**
 * Role-gating middleware. Use after requireAuth.
 *
 *   router.get(
 *     '/admin/rooms',
 *     requireAuth,
 *     requireRole(UserRole.SYSTEM_ADMIN),
 *     adminController.listRooms,
 *   );
 */
export function requireRole(...allowed: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.user) return next(new MissingAuthHeaderError());
    if (!allowed.includes(req.user.role)) return next(new InsufficientRoleError());
    next();
  };
}
