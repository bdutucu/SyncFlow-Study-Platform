import {
  NotFoundError,
  ConflictError,
  ForbiddenError,
  UnauthorizedError,
  BadRequestError,
} from '../../shared/http-error';

export class RoomNotFoundError extends NotFoundError {
  constructor() {
    super('Room not found', 'ROOM_NOT_FOUND');
  }
}

export class RoomFullError extends ConflictError {
  constructor() {
    super('Room is at maximum capacity', 'ROOM_FULL');
  }
}

export class AlreadyInAnotherRoomError extends ConflictError {
  constructor() {
    super('You are already an active member of another room', 'ALREADY_IN_ROOM');
  }
}

export class AlreadyMemberError extends ConflictError {
  constructor() {
    super('You are already a member of this room', 'ALREADY_MEMBER');
  }
}

export class NotAMemberError extends ForbiddenError {
  constructor() {
    super('You are not a member of this room', 'NOT_A_MEMBER');
  }
}

export class WrongRoomPasswordError extends UnauthorizedError {
  constructor() {
    super('Incorrect room password', 'WRONG_PASSWORD');
  }
}

export class RoomPasswordRequiredError extends BadRequestError {
  constructor() {
    super('This room requires a password', 'PASSWORD_REQUIRED');
  }
}

export class HostActionForbiddenError extends ForbiddenError {
  constructor() {
    super('Only the host (or a system admin) can perform this action', 'HOST_ONLY');
  }
}

export class CannotKickHostError extends BadRequestError {
  constructor() {
    super('The host cannot be kicked', 'CANNOT_KICK_HOST');
  }
}

export class CannotKickSelfError extends BadRequestError {
  constructor() {
    super('You cannot kick yourself; leave the room instead', 'CANNOT_KICK_SELF');
  }
}
