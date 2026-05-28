import { Request, Response, NextFunction } from 'express';
import { VoiceService } from './voice.service';
import { AuthenticatedUser } from '../auth/auth.types';

function actor(req: Request): AuthenticatedUser {
  return req.user!;
}

export class VoiceController {
  constructor(private readonly service: VoiceService) {}

  token = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const dto = await this.service.issueRoomToken(actor(req), req.params.roomId);
      res.status(200).json(dto);
    } catch (err) {
      next(err);
    }
  };
}
