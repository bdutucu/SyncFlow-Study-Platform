import { User, UserRole } from '@prisma/client';

export interface CreateUserInput {
  email: string;
  username: string;
  passwordHash: string;
  role?: UserRole;
}

export interface ListUsersOptions {
  page: number;     // 1-indexed
  pageSize: number; // capped by the service layer
  search?: string;
  bannedOnly?: boolean;
}

export interface PagedUsers {
  items: User[];
  total: number;
  page: number;
  pageSize: number;
}

/**
 * IUserRepository abstracts persistent User access.
 *
 * Per DSD §3.5.8, repository interfaces decouple services from Prisma so
 * services can be unit-tested against in-memory fakes (see
 * auth.service.test.ts). They are also the seam at which we would later
 * move a module to a different store (Redis, separate microservice, ...).
 */
export interface IUserRepository {
  findById(id: string): Promise<User | null>;
  /**
   * Bulk lookup used when a downstream module already has a set of user
   * IDs (e.g. the focus-stats leaderboard joining usernames in one
   * round-trip). Order of the returned array is NOT guaranteed; callers
   * should index by id.
   */
  findManyByIds(ids: string[]): Promise<User[]>;
  findByEmail(email: string): Promise<User | null>;
  findByUsername(username: string): Promise<User | null>;
  create(input: CreateUserInput): Promise<User>;
  setBanned(id: string, isBanned: boolean): Promise<User>;
  /** Admin-only paginated listing (DSD §3.2.6). */
  listUsers(options: ListUsersOptions): Promise<PagedUsers>;
}
