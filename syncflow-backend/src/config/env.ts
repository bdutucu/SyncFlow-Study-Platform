import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

/**
 * Validated environment. Fail fast at process start rather than crashing
 * on first request with a confusing error.
 */
const envSchema = z.object({
  PORT: z.string().regex(/^\d+$/).default('3000').transform(Number),
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  DATABASE_URL: z.string().min(1),

  // JWT (DSD §3.5.5)
  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be >= 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be >= 32 chars'),
  JWT_ACCESS_TTL: z.string().default('15m'),
  JWT_REFRESH_TTL: z.string().default('7d'),

  // Bcrypt cost (DSD §3.5.5: >= 10)
  BCRYPT_COST: z
    .string()
    .regex(/^\d+$/)
    .default('10')
    .transform(Number)
    .refine((n) => n >= 4, 'BCRYPT_COST must be >= 4'),

  // Agora voice (DSD §3.5.6, DL-01). Both optional in dev — when unset,
  // VoiceService returns a null token and the client must be in App ID
  // auth mode on the Agora console.
  AGORA_APP_ID: z.string().optional(),
  AGORA_APP_CERTIFICATE: z.string().optional(),

  // Host reconnect grace window (DSD §3.5.7). Default 30 s.
  HOST_RECONNECT_GRACE_MS: z
    .string()
    .regex(/^\d+$/)
    .default('30000')
    .transform(Number),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  // eslint-disable-next-line no-console
  console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}

export const env = parsed.data;
