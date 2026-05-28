import { prisma } from '../shared/prisma';
import {
  IChatMessageRepository,
  ChatMessageWithAuthor,
  CreateChatMessageInput,
  ListMessagesOptions,
} from './interfaces/IChatMessageRepository';

const authorSelect = {
  author: { select: { id: true, username: true } },
};

export class ChatMessageRepository implements IChatMessageRepository {
  create(input: CreateChatMessageInput): Promise<ChatMessageWithAuthor> {
    return prisma.chatMessage.create({
      data: {
        roomId: input.roomId,
        authorId: input.authorId,
        content: input.content,
      },
      include: authorSelect,
    });
  }

  findById(id: string): Promise<ChatMessageWithAuthor | null> {
    return prisma.chatMessage.findUnique({
      where: { id },
      include: authorSelect,
    });
  }

  listByRoom(
    roomId: string,
    options: ListMessagesOptions,
  ): Promise<ChatMessageWithAuthor[]> {
    // Prisma's `cursor` + `skip: 1` gives keyset pagination: results are
    // ordered desc by createdAt (newest first) and we return entries
    // strictly older than the cursor. The service reverses to asc for
    // direct rendering at the bottom of the chat pane.
    return prisma.chatMessage.findMany({
      where: { roomId },
      orderBy: { createdAt: 'desc' },
      take: options.limit,
      ...(options.before
        ? { cursor: { id: options.before }, skip: 1 }
        : {}),
      include: authorSelect,
    });
  }

  softDelete(id: string, deletedById: string): Promise<ChatMessageWithAuthor> {
    return prisma.chatMessage.update({
      where: { id },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedById,
      },
      include: authorSelect,
    });
  }
}

export const chatMessageRepository = new ChatMessageRepository();
