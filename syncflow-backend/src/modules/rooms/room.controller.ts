import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { RoomService } from './room.service';
import {
  createRoomSchema,
  updateRoomSchema,
  joinRoomSchema,
  listRoomsQuerySchema,
} from './room.validators';
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
  // requireAuth always populates req.user before this controller runs.
  return req.user!;
}

export class RoomController {
  constructor(private readonly service: RoomService) {}

  create = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parse(createRoomSchema, req.body);
      const room = await this.service.createRoom(actor(req), {
        name: input.name,
        description: input.description ?? null,
        visibility: input.visibility ?? 'PUBLIC',
        password: input.password ?? null,
        maxParticipants: input.maxParticipants ?? 10,
      });
      res.status(201).json(room);
    } catch (err) {
      next(err);
    }
  };

  listPublic = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const query = parse(listRoomsQuerySchema, req.query);
      const result = await this.service.listPublicRooms({
        page: query.page ?? 1,
        pageSize: query.pageSize ?? 20,
        search: query.search,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  getOne = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const room = await this.service.getRoom(actor(req), req.params.id);
      res.status(200).json(room);
    } catch (err) {
      next(err);
    }
  };

  update = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const patch = parse(updateRoomSchema, req.body);
      const room = await this.service.updateRoom(actor(req), req.params.id, patch);
      res.status(200).json(room);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deleteRoom(actor(req), req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  join = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      // Body is optional — clients may omit it for password-free rooms.
      const input = parse(joinRoomSchema, req.body ?? {});
      const room = await this.service.joinRoom(actor(req), req.params.id, input.password);
      res.status(200).json(room);
    } catch (err) {
      next(err);
    }
  };

  leave = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.leaveRoom(actor(req), req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };

  listMembers = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const members = await this.service.listMembers(actor(req), req.params.id);
      res.status(200).json({ members });
    } catch (err) {
      next(err);
    }
  };

  kick = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetUserId = req.params.userId;
      await this.service.kickMember(actor(req), req.params.id, targetUserId);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
