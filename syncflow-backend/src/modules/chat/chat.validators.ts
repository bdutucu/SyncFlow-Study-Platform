import { z } from 'zod';

/**
 * Wire shape for socket `chat:send_message`. The roomId is part of the
 * payload (not the event name) so a single handler covers all rooms the
 * sender is subscribed to. Content limit (2000) matches the column
 * width in schema.prisma.
 */
export const sendMessageSchema = z.object({
  roomId: z.string().uuid('roomId must be a uuid'),
  content: z
    .string()
    .trim()
    .min(1, 'Message cannot be empty')
    .max(2000, 'Message exceeds 2000 characters'),
});

/** GET /api/rooms/:roomId/messages?before=<msgId>&limit=<n> */
export const listMessagesQuerySchema = z.object({
  before: z.string().uuid('before must be a message uuid').optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type SendMessageInput = z.infer<typeof sendMessageSchema>;
export type ListMessagesQuery = z.infer<typeof listMessagesQuerySchema>;
