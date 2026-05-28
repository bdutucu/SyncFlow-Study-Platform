import { AuthService } from './auth.service';
import {
  IUserRepository,
  CreateUserInput,
} from '../../repositories/interfaces/IUserRepository';
import { User, UserRole } from '@prisma/client';

/**
 * In-memory IUserRepository for unit tests. Demonstrates the testability
 * gain from the repository pattern (DSD §3.5.8): the service runs with no
 * database at all.
 */
class InMemoryUserRepo implements IUserRepository {
  private byId = new Map<string, User>();
  private byEmail = new Map<string, User>();
  private byUsername = new Map<string, User>();
  private counter = 0;

  async findById(id: string): Promise<User | null> {
    return this.byId.get(id) ?? null;
  }
  async findByEmail(email: string): Promise<User | null> {
    return this.byEmail.get(email.toLowerCase()) ?? null;
  }
  async findByUsername(username: string): Promise<User | null> {
    return this.byUsername.get(username) ?? null;
  }
  async create(input: CreateUserInput): Promise<User> {
    const id = `user_${++this.counter}`;
    const now = new Date();
    const user: User = {
      id,
      email: input.email.toLowerCase(),
      username: input.username,
      passwordHash: input.passwordHash,
      role: input.role ?? UserRole.STANDARD,
      isBanned: false,
      createdAt: now,
      updatedAt: now,
    };
    this.byId.set(id, user);
    this.byEmail.set(user.email, user);
    this.byUsername.set(user.username, user);
    return user;
  }
  async setBanned(id: string, isBanned: boolean): Promise<User> {
    const u = this.byId.get(id);
    if (!u) throw new Error('not found');
    u.isBanned = isBanned;
    return u;
  }
}

describe('AuthService', () => {
  let repo: InMemoryUserRepo;
  let service: AuthService;

  beforeEach(() => {
    repo = new InMemoryUserRepo();
    service = new AuthService(repo);
  });

  describe('register', () => {
    it('creates a new user and returns access + refresh tokens', async () => {
      const result = await service.register({
        email: 'alice@example.com',
        username: 'alice',
        password: 'Secret123',
      });

      expect(result.user.email).toBe('alice@example.com');
      expect(result.user.role).toBe(UserRole.STANDARD);
      expect(result.tokens.accessToken).toEqual(expect.any(String));
      expect(result.tokens.refreshToken).toEqual(expect.any(String));
      expect(result.tokens.accessToken).not.toEqual(result.tokens.refreshToken);
    });

    it('rejects duplicate email', async () => {
      await service.register({ email: 'a@a.com', username: 'a1', password: 'Secret123' });
      await expect(
        service.register({ email: 'a@a.com', username: 'a2', password: 'Secret123' }),
      ).rejects.toThrow(/email/i);
    });

    it('rejects duplicate username', async () => {
      await service.register({ email: 'a@a.com', username: 'shared', password: 'Secret123' });
      await expect(
        service.register({ email: 'b@b.com', username: 'shared', password: 'Secret123' }),
      ).rejects.toThrow(/username/i);
    });
  });

  describe('login', () => {
    it('returns tokens for correct credentials', async () => {
      await service.register({ email: 'b@b.com', username: 'bob', password: 'Secret123' });
      const result = await service.login({ email: 'b@b.com', password: 'Secret123' });
      expect(result.user.username).toBe('bob');
    });

    it('rejects wrong password', async () => {
      await service.register({ email: 'c@c.com', username: 'carl', password: 'Secret123' });
      await expect(
        service.login({ email: 'c@c.com', password: 'WrongPass1' }),
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects unknown email without leaking', async () => {
      await expect(
        service.login({ email: 'nobody@nowhere.com', password: 'Secret123' }),
      ).rejects.toThrow(/invalid/i);
    });

    it('rejects banned account', async () => {
      const reg = await service.register({
        email: 'd@d.com',
        username: 'dan',
        password: 'Secret123',
      });
      await repo.setBanned(reg.user.id, true);
      await expect(
        service.login({ email: 'd@d.com', password: 'Secret123' }),
      ).rejects.toThrow(/banned/i);
    });
  });

  describe('refresh', () => {
    it('issues a new token pair from a valid refresh token', async () => {
      const reg = await service.register({
        email: 'e@e.com',
        username: 'eve',
        password: 'Secret123',
      });
      const fresh = await service.refresh(reg.tokens.refreshToken);
      expect(fresh.accessToken).toEqual(expect.any(String));
      expect(fresh.refreshToken).toEqual(expect.any(String));
    });

    it('rejects a garbage refresh token', async () => {
      await expect(service.refresh('not-a-real-token')).rejects.toThrow(/invalid/i);
    });

    it('rejects an access token presented as refresh', async () => {
      const reg = await service.register({
        email: 'f@f.com',
        username: 'fay',
        password: 'Secret123',
      });
      // Passing accessToken to refresh() should fail the type-claim check.
      await expect(service.refresh(reg.tokens.accessToken)).rejects.toThrow(/invalid/i);
    });

    it('rejects refresh from a banned user', async () => {
      const reg = await service.register({
        email: 'g@g.com',
        username: 'gus',
        password: 'Secret123',
      });
      await repo.setBanned(reg.user.id, true);
      await expect(service.refresh(reg.tokens.refreshToken)).rejects.toThrow(/banned/i);
    });
  });

  describe('resolveAuthenticatedUser', () => {
    it('returns id+role for a healthy user', async () => {
      const reg = await service.register({
        email: 'h@h.com',
        username: 'han',
        password: 'Secret123',
      });
      const resolved = await service.resolveAuthenticatedUser(reg.user.id);
      expect(resolved).toEqual({ id: reg.user.id, role: UserRole.STANDARD });
    });

    it('rejects banned user (Socket reconnection path)', async () => {
      const reg = await service.register({
        email: 'i@i.com',
        username: 'ian',
        password: 'Secret123',
      });
      await repo.setBanned(reg.user.id, true);
      await expect(service.resolveAuthenticatedUser(reg.user.id)).rejects.toThrow(/banned/i);
    });
  });
});
