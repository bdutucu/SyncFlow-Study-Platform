import { z } from 'zod';

export const banUserBodySchema = z.object({
  reason: z
    .string()
    .trim()
    .min(1, 'Reason cannot be empty if provided')
    .max(500, 'Reason exceeds 500 characters')
    .nullish()
    .transform((v) => v ?? null),
});

export const listUsersQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(80).optional(),
  bannedOnly: z
    .union([z.literal('true'), z.literal('false'), z.boolean()])
    .optional()
    .transform((v) => v === true || v === 'true'),
});

export const listBansQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export type BanUserBody = z.infer<typeof banUserBodySchema>;
export type ListUsersQuery = z.infer<typeof listUsersQuerySchema>;
export type ListBansQuery = z.infer<typeof listBansQuerySchema>;
