import { UserRole } from '@prisma/client';
import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import {
  IChatMessageRepository,
  ChatMessageWithAuthor,
} from '../../repositories/interfaces/IChatMessageRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { ChatMessageDTO, PagedMessagesDTO } from './chat.types';
import { IChatEventPublisher } from './chat.events';
import {
  ChatRoomNotFoundError,
  ChatMessageNotFoundError,
  ChatNotAMemberError,
  ChatDeleteForbiddenError,
  ChatInvalidCursorError,
  ChatInvalidContentError,
} from './chat.errors';

const MAX_CONTENT = 2000;
const MAX_PAGE_SIZE = 100;

/**
 * ChatService — Real-Time Chat component (DSD §3.2.4).
 *
 * Responsibilities (functional requirements):
 *   • Send: any active member of a room may post a text message; the
 *     persisted message is broadcast to all subscribers of that room.
 *   • List: any active member (or SYSTEM_ADMIN) may fetch history with
 *     keyset pagination.
 *   • Delete: the author may soft-delete their own message; any
 *     SYSTEM_ADMIN may delete any message (DSD §3.2.6 moderation).
 *
 * Persistence (DSD §3.5.3 revision): messages are stored. Soft delete
 * preserves the row with isDeleted=true so we can attribute moderation
 * without leaking the original text — the DTO redacts `content` to ""
 * for deleted rows.
 */
export class ChatService {
  constructor(
    private readonly rooms: IRoomRepository,
    private readonly messages: IChatMessageRepository,
    private readonly publisher: IChatEventPublisher,
  ) {}

  // -------------------------------------------------------- public API ----

  async sendMessage(
    actor: AuthenticatedUser,
    roomId: string,
    rawContent: string,
  ): Promise<ChatMessageDTO> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new ChatRoomNotFoundError();

    await this.requireActiveMembership(actor, roomId);

    // Defence-in-depth: the validator at the boundary already enforces
    // length and non-empty, but the service should not trust callers.
    const content = rawContent.trim();
    if (content.length === 0 || content.length > MAX_CONTENT) {
      throw new ChatInvalidContentError();
    }

    const persisted = await this.messages.create({
      roomId,
      authorId: actor.id,
      content,
    });

    const dto = toDTO(persisted);
    this.publisher.newMessage(roomId, dto);
    return dto;
  }

  async listMessages(
    actor: AuthenticatedUser,
    roomId: string,
    options: { before?: string; limit: number },
  ): Promise<PagedMessagesDTO> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new ChatRoomNotFoundError();

    await this.requireActiveMembership(actor, roomId);

    const limit = Math.min(options.limit, MAX_PAGE_SIZE);

    // Validate cursor early so we can return a clean 400 instead of a
    // confusing empty page when the cursor is gibberish.
    if (options.before !== undefined) {
      const cursor = await this.messages.findById(options.before);
      if (!cursor || cursor.roomId !== roomId) throw new ChatInvalidCursorError();
    }

    // Fetch one extra row to determine hasMore without a second query.
    const rows = await this.messages.listByRoom(roomId, {
      before: options.before,
      limit: limit + 1,
    });

    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;

    // Repo returns desc by createdAt; reverse to asc for direct rendering.
    const ascending = [...page].reverse();

    return {
      messages: ascending.map(toDTO),
      hasMore,
      // The cursor for the NEXT (older) page is the oldest message in
      // this page — which after reversing is the first element.
      nextCursor: hasMore ? ascending[0].id : null,
    };
  }

  async deleteMessage(actor: AuthenticatedUser, messageId: string): Promise<void> {
    const msg = await this.messages.findById(messageId);
    if (!msg) throw new ChatMessageNotFoundError();

    const isAuthor = msg.authorId === actor.id;
    const isAdmin = actor.role === UserRole.SYSTEM_ADMIN;
    if (!isAuthor && !isAdmin) throw new ChatDeleteForbiddenError();

    // Idempotent: a second delete is a no-op (no event re-emitted).
    if (msg.isDeleted) return;

    await this.messages.softDelete(messageId, actor.id);
    this.publisher.messageDeleted(msg.roomId, messageId, actor.id);
  }

  // ------------------------------------------------------ private bits ----

  private async requireActiveMembership(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<void> {
    if (actor.role === UserRole.SYSTEM_ADMIN) return;
    const m = await this.rooms.findMembership(actor.id, roomId);
    if (!m || m.status !== 'ACTIVE') throw new ChatNotAMemberError();
  }
}

// ----------------------------------------------------- DTO conversion ----

function toDTO(msg: ChatMessageWithAuthor): ChatMessageDTO {
  return {
    id: msg.id,
    roomId: msg.roomId,
    authorId: msg.authorId,
    authorUsername: msg.author.username,
    content: msg.isDeleted ? '' : msg.content,
    isDeleted: msg.isDeleted,
    deletedByUserId: msg.deletedById,
    createdAt: msg.createdAt.toISOString(),
  };
}
