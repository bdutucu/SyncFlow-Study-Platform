import { ChatMessage } from '@prisma/client';

/** Embedded author info — joined in every read so the service doesn't N+1. */
export interface ChatMessageWithAuthor extends ChatMessage {
  author: { id: string; username: string };
}

export interface CreateChatMessageInput {
  roomId: string;
  authorId: string;
  content: string;
}

export interface ListMessagesOptions {
  /** Message id to paginate before (exclusive). Omit for the latest page. */
  before?: string;
  /** Maximum messages to return. Service caps this at 100. */
  limit: number;
}

/**
 * IChatMessageRepository — persistence surface for chat messages
 * (DSD §3.2.4, §3.5.3, §3.5.8).
 *
 * Reads always include the author so the service can build DTOs without
 * an extra round trip. Pagination is keyset-style (`before` is a message
 * id) for stable scrolling regardless of intervening inserts.
 */
export interface IChatMessageRepository {
  create(input: CreateChatMessageInput): Promise<ChatMessageWithAuthor>;
  findById(id: string): Promise<ChatMessageWithAuthor | null>;
  listByRoom(roomId: string, options: ListMessagesOptions): Promise<ChatMessageWithAuthor[]>;
  softDelete(id: string, deletedById: string): Promise<ChatMessageWithAuthor>;
}
