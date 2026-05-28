import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AdminService } from './admin.service';
import {
  banUserBodySchema,
  listUsersQuerySchema,
  listBansQuerySchema,
} from './admin.validators';
import { BadRequestError } from '../../shared/http-error';
import { AuthenticatedUser } from '../auth/auth.types';

function parse<T>(schema: ZodSchema<T>, value: unknown): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw new BadRequestError(
      result.error.issues.map((i) => i.message).join('; '),
      'VALIDATION',
    );
  }
  return result.data;
}

function actor(req: Request): AuthenticatedUser {
  return req.user!;
}

export class AdminController {
  constructor(private readonly service: AdminService) {}

  listUsers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parse(listUsersQuerySchema, req.query);
      const result = await this.service.listUsers(actor(req), {
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        search: query.search,
        bannedOnly: query.bannedOnly === true || query.bannedOnly === 'true',
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  ban = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parse(banUserBodySchema, req.body ?? {});
      const result = await this.service.banUser(
        actor(req),
        req.params.userId,
        body.reason ?? null,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  unban = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = parse(banUserBodySchema, req.body ?? {});
      const result = await this.service.unbanUser(
        actor(req),
        req.params.userId,
        body.reason ?? null,
      );
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  banHistory = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parse(listBansQuerySchema, req.query);
      const records = await this.service.listBanHistory(
        actor(req),
        req.params.userId,
        { limit: query.limit ?? 50 },
      );
      res.status(200).json({ records });
    } catch (err) {
      next(err);
    }
  };
}
