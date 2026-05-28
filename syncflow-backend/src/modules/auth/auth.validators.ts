import { z } from 'zod';

/**
 * Input shape for POST /api/auth/register.
 *
 * Username and password rules are conservative defaults; tighten/loosen per
 * the SRS once final acceptance criteria are pinned down.
 */
export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(255),
  username: z
    .string()
    .trim()
    .min(3, 'Username must be at least 3 characters')
    .max(32, 'Username must be at most 32 characters')
    .regex(
      /^[A-Za-z0-9_.-]+$/,
      'Username may contain letters, digits, dot, dash, underscore',
    ),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be at most 128 characters')
    .regex(/[A-Za-z]/, 'Password must contain at least one letter')
    .regex(/[0-9]/, 'Password must contain at least one digit'),
});

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1, 'Password is required').max(128),
});

export const refreshSchema = z.object({
  refreshToken: z.string().min(1, 'refreshToken is required'),
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshInput = z.infer<typeof refreshSchema>;
