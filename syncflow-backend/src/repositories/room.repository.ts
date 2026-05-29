import {
  Room,
  RoomMembership,
  MembershipStatus,
} from '@prisma/client';
import { prisma } from '../shared/prisma';
import {
  IRoomRepository,
  CreateRoomData,
  UpdateRoomData,
  ListPublicOptions,
  PagedRooms,
  RoomWithMemberCount,
  MemberInfo,
} from './interfaces/IRoomRepository';

export class RoomRepository implements IRoomRepository {
  async createWithHostMembership(data: CreateRoomData): Promise<Room> {
    // One transaction: create room + host's ACTIVE membership together.
    // Avoids the window where a room exists with no host membership.
    return prisma.$transaction(async (tx) => {
      const room = await tx.room.create({
        data: {
          name: data.name,
          description: data.description,
          hostId: data.hostId,
          visibility: data.visibility,
          tag: data.tag,
          passwordHash: data.passwordHash,
          maxParticipants: data.maxParticipants,
        },
      });
      await tx.roomMembership.create({
        data: {
          userId: data.hostId,
          roomId: room.id,
          status: 'ACTIVE',
        },
      });
      return room;
    });
  }

  findById(id: string): Promise<Room | null> {
    return prisma.room.findUnique({ where: { id } });
  }

  async listPublic(options: ListPublicOptions): Promise<PagedRooms> {
    const { page, pageSize, search, tag } = options;
    const where = {
      visibility: 'PUBLIC' as const,
      ...(tag ? { tag } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search, mode: 'insensitive' as const } },
              { description: { contains: search, mode: 'insensitive' as const } },
            ],
          }
        : {}),
    };

    const [rows, total] = await Promise.all([
      prisma.room.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          _count: {
            // Filtered relation count (Prisma >= 4.3): count only ACTIVE rows.
            select: { memberships: { where: { status: 'ACTIVE' } } },
          },
        },
      }),
      prisma.room.count({ where }),
    ]);

    const items: RoomWithMemberCount[] = rows.map((r) => {
      const { _count, ...rest } = r;
      return { ...rest, memberCount: _count.memberships };
    });

    return { items, total, page, pageSize };
  }

  update(id: string, patch: UpdateRoomData): Promise<Room> {
    return prisma.room.update({ where: { id }, data: patch });
  }

  async delete(id: string): Promise<void> {
    await prisma.room.delete({ where: { id } });
  }

  transferHost(roomId: string, newHostId: string): Promise<Room> {
    return prisma.room.update({
      where: { id: roomId },
      data: { hostId: newHostId },
    });
  }

  findMembership(userId: string, roomId: string): Promise<RoomMembership | null> {
    return prisma.roomMembership.findUnique({
      where: { userId_roomId: { userId, roomId } },
    });
  }

  findActiveMembershipByUser(userId: string): Promise<RoomMembership | null> {
    return prisma.roomMembership.findFirst({
      where: { userId, status: 'ACTIVE' },
    });
  }

  async listActiveMembers(roomId: string): Promise<MemberInfo[]> {
    const rows = await prisma.roomMembership.findMany({
      where: { roomId, status: 'ACTIVE' },
      orderBy: { joinedAt: 'asc' },
      include: { user: { select: { id: true, username: true } } },
    });
    return rows.map((r) => ({
      userId: r.user.id,
      username: r.user.username,
      joinedAt: r.joinedAt,
    }));
  }

  countActiveMembers(roomId: string): Promise<number> {
    return prisma.roomMembership.count({
      where: { roomId, status: 'ACTIVE' },
    });
  }

  activateMembership(userId: string, roomId: string): Promise<RoomMembership> {
    return prisma.roomMembership.upsert({
      where: { userId_roomId: { userId, roomId } },
      update: { status: 'ACTIVE', joinedAt: new Date(), leftAt: null },
      create: { userId, roomId, status: 'ACTIVE' },
    });
  }

  closeMembership(
    userId: string,
    roomId: string,
    status: Extract<MembershipStatus, 'LEFT' | 'KICKED'>,
  ): Promise<RoomMembership> {
    return prisma.roomMembership.update({
      where: { userId_roomId: { userId, roomId } },
      data: { status, leftAt: new Date() },
    });
  }
}

export const roomRepository = new RoomRepository();
