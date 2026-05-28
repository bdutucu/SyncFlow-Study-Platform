import {
  ForbiddenError,
  NotFoundError,
  BadRequestError,
} from '../../shared/http-error';

export class ChatRoomNotFoundError extends NotFoundError {
  constructor() {
    super('Room not found', 'ROOM_NOT_FOUND');
  }
}

export class ChatMessageNotFoundError extends NotFoundError {
  constructor() {
    super('Message not found', 'MESSAGE_NOT_FOUND');
  }
}

export class ChatNotAMemberError extends ForbiddenError {
  constructor() {
    super('You must be an active member of the room to chat', 'CHAT_NOT_MEMBER');
  }
}

export class ChatDeleteForbiddenError extends ForbiddenError {
  constructor() {
    super(
      'You can only delete your own messages (admins may delete any)',
      'CHAT_DELETE_FORBIDDEN',
    );
  }
}

export class ChatInvalidCursorError extends BadRequestError {
  constructor() {
    super('Invalid pagination cursor', 'CHAT_INVALID_CURSOR');
  }
}

export class ChatInvalidContentError extends BadRequestError {
  constructor() {
    super('Message content is empty or too long', 'CHAT_INVALID_CONTENT');
  }
}
