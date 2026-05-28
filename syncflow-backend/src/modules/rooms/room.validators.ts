import { z } from 'zod';
import { RoomVisibility } from '@prisma/client';

export const createRoomSchema = z.object({
  name: z.string().trim().min(3, 'Name must be at least 3 characters').max(80),
  description: z.string().trim().max(500).nullish().transform((v) => v ?? null),
  visibility: z.nativeEnum(RoomVisibility).default(RoomVisibility.PUBLIC),
  password: z.string().min(4).max(128).nullish().transform((v) => v ?? null),
  maxParticipants: z
    .number()
    .int()
    .min(2, 'A room needs at least 2 seats')
    .max(50, 'A room can host at most 50 participants')
    .default(10),
});

export const updateRoomSchema = z
  .object({
    name: z.string().trim().min(3).max(80).optional(),
    description: z.string().trim().max(500).nullable().optional(),
    visibility: z.nativeEnum(RoomVisibility).optional(),
    /**
     * Password handling on update:
     *   • null     → remove the password (room becomes open)
     *   • string   → set a new password (will be re-hashed)
     *   • omitted  → leave unchanged
     */
    password: z.string().min(4).max(128).nullable().optional(),
    maxParticipants: z.number().int().min(2).max(50).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, 'At least one field must be provided');

export const joinRoomSchema = z.object({
  password: z.string().min(1).max(128).optional(),
});

export const listRoomsQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().min(1).max(80).optional(),
});

export type CreateRoomInput = z.infer<typeof createRoomSchema>;
export type UpdateRoomInput = z.infer<typeof updateRoomSchema>;
export type JoinRoomInput = z.infer<typeof joinRoomSchema>;
export type ListRoomsQuery = z.infer<typeof listRoomsQuerySchema>;
