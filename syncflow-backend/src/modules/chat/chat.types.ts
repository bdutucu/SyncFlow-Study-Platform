/**
 * ChatMessageDTO — wire shape sent to clients.
 *
 *   • content is "" when isDeleted, regardless of the requester. The
 *     original text stays in the database for audit but is never
 *     exposed via the API. This is the moderation contract.
 *   • deletedByUserId lets the UI distinguish self-deletion from
 *     moderator action (compare to authorId).
 */
export interface ChatMessageDTO {
  id: string;
  roomId: string;
  authorId: string;
  authorUsername: string;
  content: string;
  isDeleted: boolean;
  deletedByUserId: string | null;
  createdAt: string; // ISO-8601
}

/**
 * PagedMessagesDTO — keyset pagination over a room's history. Messages
 * are returned in ASC order so a client can append at the bottom of
 * the chat pane. To fetch older messages, pass `nextCursor` back as the
 * `before` query parameter.
 */
export interface PagedMessagesDTO {
  messages: ChatMessageDTO[];
  hasMore: boolean;
  nextCursor: string | null;
}
