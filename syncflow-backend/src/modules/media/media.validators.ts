import { z } from 'zod';

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

/** Common shape: every command takes the room id in the payload. */
const roomIdField = z.string().uuid('roomId must be a uuid');

export const mediaRoomOnlySchema = z.object({
  roomId: roomIdField,
});

export const mediaLoadSchema = z.object({
  roomId: roomIdField,
  url: z.string().trim().min(1).max(2000),
  startAtMs: z.number().int().min(0).max(ONE_DAY_MS).optional(),
});

export const mediaSeekSchema = z.object({
  roomId: roomIdField,
  positionMs: z.number().int().min(0).max(ONE_DAY_MS),
});

export type MediaRoomOnlyInput = z.infer<typeof mediaRoomOnlySchema>;
export type MediaLoadInput = z.infer<typeof mediaLoadSchema>;
export type MediaSeekInput = z.infer<typeof mediaSeekSchema>;
