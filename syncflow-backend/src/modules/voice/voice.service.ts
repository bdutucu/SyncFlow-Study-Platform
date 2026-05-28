import { UserRole } from '@prisma/client';
import { IRoomRepository } from '../../repositories/interfaces/IRoomRepository';
import { AuthenticatedUser } from '../auth/auth.types';
import { IVoiceTokenIssuer, VoiceTokenDTO } from './voice.types';
import { VoiceNotMemberError, VoiceRoomNotFoundError } from './voice.errors';

/**
 * VoiceService — Voice Integration component (DSD §3.5.6, DL-01).
 *
 * Single responsibility: authorize a request to join an audio channel
 * tied to a specific room, then delegate token minting to the issuer.
 *
 * Authorization mirrors the membership rules used by Chat and Timer:
 * only an active member of the room (or a SYSTEM_ADMIN) may obtain a
 * token. This keeps the voice channel coterminous with the study room.
 */
export class VoiceService {
  constructor(
    private readonly rooms: IRoomRepository,
    private readonly issuer: IVoiceTokenIssuer,
  ) {}

  async issueRoomToken(
    actor: AuthenticatedUser,
    roomId: string,
  ): Promise<VoiceTokenDTO> {
    const room = await this.rooms.findById(roomId);
    if (!room) throw new VoiceRoomNotFoundError();

    if (actor.role !== UserRole.SYSTEM_ADMIN) {
      const m = await this.rooms.findMembership(actor.id, roomId);
      if (!m || m.status !== 'ACTIVE') throw new VoiceNotMemberError();
    }

    return this.issuer.issue(actor.id, roomId);
  }
}
