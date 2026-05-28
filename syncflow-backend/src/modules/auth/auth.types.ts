import { UserRole } from '@prisma/client';

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
}

export interface PublicUser {
  id: string;
  email: string;
  username: string;
  role: UserRole;
}

export interface AuthResult {
  user: PublicUser;
  tokens: AuthTokens;
}

/**
 * Augment Express's Request so handlers downstream of requireAuth can read
 * `req.user` with full type safety.
 */
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthenticatedUser;
    }
  }
}
