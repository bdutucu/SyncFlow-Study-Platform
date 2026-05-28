import jwt, { SignOptions, JwtPayload } from 'jsonwebtoken';
import { UserRole } from '@prisma/client';
import { env } from '../config/env';

/**
 * JWT helpers (DSD §3.5.5).
 *
 * Two separate secrets so a leaked access token cannot be used to forge a
 * refresh token. Tokens are tagged with a `type` claim to prevent
 * mixing them up at the verify step.
 *
 * Access TTL is short (default 15m) so the unrevoked-window after a ban
 * remains small; the refresh-token flow bears the cost of re-issuing.
 */

export interface AuthTokenPayload extends JwtPayload {
  sub: string;
  role: UserRole;
  type: 'access' | 'refresh';
}

interface SignArgs {
  userId: string;
  role: UserRole;
}

function sign(secret: string, ttl: string, payload: object): string {
  const opts = { expiresIn: ttl } as SignOptions;
  return jwt.sign(payload, secret, opts);
}

export function signAccessToken({ userId, role }: SignArgs): string {
  return sign(env.JWT_ACCESS_SECRET, env.JWT_ACCESS_TTL, {
    sub: userId,
    role,
    type: 'access',
  });
}

export function signRefreshToken({ userId, role }: SignArgs): string {
  return sign(env.JWT_REFRESH_SECRET, env.JWT_REFRESH_TTL, {
    sub: userId,
    role,
    type: 'refresh',
  });
}

export function verifyAccessToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as AuthTokenPayload;
  if (decoded.type !== 'access') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
  return decoded;
}

export function verifyRefreshToken(token: string): AuthTokenPayload {
  const decoded = jwt.verify(token, env.JWT_REFRESH_SECRET) as AuthTokenPayload;
  if (decoded.type !== 'refresh') {
    throw new jwt.JsonWebTokenError('Invalid token type');
  }
  return decoded;
}
