import { User } from '@prisma/client';
import { prisma } from '../shared/prisma';
import {
  IUserRepository,
  CreateUserInput,
  ListUsersOptions,
  PagedUsers,
} from './interfaces/IUserRepository';

export class UserRepository implements IUserRepository {
  findById(id: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { id } });
  }

  findManyByIds(ids: string[]): Promise<User[]> {
    if (ids.length === 0) return Promise.resolve([]);
    return prisma.user.findMany({ where: { id: { in: ids } } });
  }

  findByEmail(email: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  }

  findByUsername(username: string): Promise<User | null> {
    return prisma.user.findUnique({ where: { username } });
  }

  create(input: CreateUserInput): Promise<User> {
    return prisma.user.create({
      data: {
        email: input.email.toLowerCase(),
        username: input.username,
        passwordHash: input.passwordHash,
        role: input.role,
      },
    });
  }

  setBanned(id: string, isBanned: boolean): Promise<User> {
    return prisma.user.update({
      where: { id },
      data: { isBanned },
    });
  }

  async listUsers(options: ListUsersOptions): Promise<PagedUsers> {
    const where = {
      ...(options.bannedOnly ? { isBanned: true } : {}),
      ...(options.search
        ? {
            OR: [
              { username: { contains: options.search, mode: 'insensitive' as const } },
              { email: { contains: options.search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [items, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (options.page - 1) * options.pageSize,
        take: options.pageSize,
      }),
      prisma.user.count({ where }),
    ]);

    return { items, total, page: options.page, pageSize: options.pageSize };
  }
}

/** Default instance — wired into the composition root in src/server.ts. */
export const userRepository = new UserRepository();
