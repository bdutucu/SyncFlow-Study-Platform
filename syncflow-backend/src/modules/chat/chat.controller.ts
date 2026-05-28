import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ChatService } from './chat.service';
import { listMessagesQuerySchema } from './chat.validators';
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

export class ChatController {
  constructor(private readonly service: ChatService) {}

  list = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { roomId } = req.params;
      const query = parse(listMessagesQuerySchema, req.query);
      const result = await this.service.listMessages(actor(req), roomId, {
        before: query.before,
        limit: query.limit ?? 50,
      });
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  remove = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await this.service.deleteMessage(actor(req), req.params.id);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  };
}
