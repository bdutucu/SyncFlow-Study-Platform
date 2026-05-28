import { ForbiddenError, NotFoundError } from '../../shared/http-error';

export class VoiceNotMemberError extends ForbiddenError {
  constructor() {
    super('Not an active member of this room', 'VOICE_NOT_MEMBER');
  }
}

export class VoiceRoomNotFoundError extends NotFoundError {
  constructor() {
    super('Room not found', 'VOICE_ROOM_NOT_FOUND');
  }
}
