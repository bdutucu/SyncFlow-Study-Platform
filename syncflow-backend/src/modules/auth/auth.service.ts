import { UserRole } from '@prisma/client';
import { IUserRepository } from '../../repositories/interfaces/IUserRepository';
import { IBanRecordRepository } from '../../repositories/interfaces/IBanRecordRepository';
import { hashPassword, verifyPassword, dummyCompare } from '../../shared/password';
import {
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../../shared/jwt';
import { RegisterInput, LoginInput } from './auth.validators';
import {
  AuthenticatedUser,
  AuthResult,
  AuthTokens,
  PublicUser,
} from './auth.types';
import {
  EmailAlreadyInUseError,
  UsernameAlreadyInUseError,
  InvalidCredentialsError,
  AccountBannedError,
  InvalidOrExpiredTokenError,
} from './auth.errors';
import { User } from '@prisma/client';

/**
 * AuthService — Authentication & Authorization component (DSD §3.2.1).
 *
 * Responsibilities:
 *   • Register new accounts, hashing passwords with bcrypt (DSD §3.5.5).
 *   • Authenticate login attempts and issue JWT access + refresh tokens.
 *   • Exchange refresh tokens for a fresh pair, re-validating ban status.
 *   • Resolve an authenticated user from a token subject (used by the
 *     Socket.IO middleware to enforce the live ban check from DSD §3.5.5).
 *
 * The service depends on IUserRepository rather than Prisma directly so
 * that unit tests can run against an in-memory fake (DSD §3.5.8). This is
 * what makes the SRS §3.3.5 ">=80% unit-test coverage" target affordable
 * for the auth surface.
 */
export class AuthService {
  constructor(
    private readonly users: IUserRepository,
    /** Optional — only used to surface the ban reason in error responses. */
    private readonly bans?: IBanRecordRepository,
  ) {}

  /**
   * Return the reason recorded on the user's most recent BAN action (if
   * any). Used to enrich AccountBannedError so the login screen can show
   * the user WHY they're locked out.
   */
  private async latestBanReason(userId: string): Promise<string | null> {
    if (!this.bans) return null;
    try {
      const records = await this.bans.listForUser(userId, { limit: 5 });
      const latestBan = records.find((r) => r.action === 'BAN');
      return latestBan?.reason ?? null;
    } catch {
      return null;
    }
  }

  async register(input: RegisterInput): Promise<AuthResult> {
    // Check uniqueness in parallel — neither query depends on the other.
    const [existingByEmail, existingByUsername] = await Promise.all([
      this.users.findByEmail(input.email),
      this.users.findByUsername(input.username),
    ]);
    if (existingByEmail) throw new EmailAlreadyInUseError();
    if (existingByUsername) throw new UsernameAlreadyInUseError();

    const passwordHash = await hashPassword(input.password);
    const user = await this.users.create({
      email: input.email,
      username: input.username,
      passwordHash,
      role: UserRole.STANDARD,
    });

    return {
      user: this.toPublicUser(user),
      tokens: this.issueTokens(user.id, user.role),
    };
  }

  async login(input: LoginInput): Promise<AuthResult> {
    const user = await this.users.findByEmail(input.email);

    if (!user) {
      // Burn the same time as a real bcrypt compare to prevent email
      // enumeration via response timing.
      await dummyCompare(input.password);
      throw new InvalidCredentialsError();
    }

    const passwordOk = await verifyPassword(input.password, user.passwordHash);
    if (!passwordOk) throw new InvalidCredentialsError();

    if (user.isBanned) {
      throw new AccountBannedError(await this.latestBanReason(user.id));
    }

    return {
      user: this.toPublicUser(user),
      tokens: this.issueTokens(user.id, user.role),
    };
  }

  /**
   * Exchange a valid refresh token for a fresh access+refresh pair.
   * Ban status is re-checked here (DSD §3.5.5).
   */
  async refresh(refreshToken: string): Promise<AuthTokens> {
    let payload;
    try {
      payload = verifyRefreshToken(refreshToken);
    } catch {
      throw new InvalidOrExpiredTokenError('Refresh token invalid or expired');
    }

    const user = await this.users.findById(payload.sub);
    if (!user) throw new InvalidOrExpiredTokenError('User no longer exists');
    if (user.isBanned) {
      throw new AccountBannedError(await this.latestBanReason(user.id));
    }

    return this.issueTokens(user.id, user.role);
  }

  /**
   * Resolve a fully-authenticated user from an access-token subject. Used by
   * the Socket.IO middleware to perform the live ban re-check on (re)connect.
   */
  async resolveAuthenticatedUser(userId: string): Promise<AuthenticatedUser> {
    const user = await this.users.findById(userId);
    if (!user) throw new InvalidOrExpiredTokenError('User no longer exists');
    if (user.isBanned) {
      throw new AccountBannedError(await this.latestBanReason(userId));
    }
    return { id: user.id, role: user.role };
  }

  private issueTokens(userId: string, role: UserRole): AuthTokens {
    return {
      accessToken: signAccessToken({ userId, role }),
      refreshToken: signRefreshToken({ userId, role }),
    };
  }

  private toPublicUser(user: User): PublicUser {
    return {
      id: user.id,
      email: user.email,
      username: user.username,
      role: user.role,
    };
  }
}
