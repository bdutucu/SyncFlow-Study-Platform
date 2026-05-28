import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { AuthService } from './auth.service';
import {
  registerSchema,
  loginSchema,
  refreshSchema,
} from './auth.validators';
import { BadRequestError } from '../../shared/http-error';

function parseBody<T>(schema: ZodSchema<T>, body: unknown): T {
  const result = schema.safeParse(body);
  if (!result.success) {
    const message = result.error.issues.map((i) => i.message).join('; ');
    throw new BadRequestError(message, 'VALIDATION');
  }
  return result.data;
}

/**
 * AuthController — thin HTTP shell. Business decisions live in AuthService;
 * the controller only handles wire-format validation and response shaping.
 */
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  register = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseBody(registerSchema, req.body);
      const result = await this.authService.register(input);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  };

  login = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseBody(loginSchema, req.body);
      const result = await this.authService.login(input);
      res.status(200).json(result);
    } catch (err) {
      next(err);
    }
  };

  refresh = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const input = parseBody(refreshSchema, req.body);
      const tokens = await this.authService.refresh(input.refreshToken);
      res.status(200).json({ tokens });
    } catch (err) {
      next(err);
    }
  };

  /** Returns the authenticated user; requireAuth has populated req.user. */
  me = (req: Request, res: Response): void => {
    res.status(200).json({ user: req.user });
  };
}
