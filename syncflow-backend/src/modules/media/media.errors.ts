import {
  ForbiddenError,
  NotFoundError,
  BadRequestError,
  ConflictError,
} from '../../shared/http-error';

export class MediaHostActionForbiddenError extends ForbiddenError {
  constructor() {
    super('Only the host can control media playback', 'MEDIA_HOST_ONLY');
  }
}

export class MediaNotMemberError extends ForbiddenError {
  constructor() {
    super('You must be a member of the room to view media state', 'MEDIA_NOT_MEMBER');
  }
}

export class MediaRoomNotFoundError extends NotFoundError {
  constructor() {
    super('Room not found', 'ROOM_NOT_FOUND');
  }
}

export class MediaInvalidUrlError extends BadRequestError {
  constructor() {
    super('Unsupported or malformed video URL', 'MEDIA_INVALID_URL');
  }
}

export class MediaNoVideoLoadedError extends ConflictError {
  constructor() {
    super('No video is currently loaded', 'MEDIA_NO_VIDEO');
  }
}
