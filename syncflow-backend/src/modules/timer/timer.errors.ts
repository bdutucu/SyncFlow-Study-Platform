import {
  ForbiddenError,
  ConflictError,
  NotFoundError,
} from '../../shared/http-error';

export class TimerHostActionForbiddenError extends ForbiddenError {
  constructor() {
    super('Only the host can control the timer', 'TIMER_HOST_ONLY');
  }
}

export class TimerNotMemberError extends ForbiddenError {
  constructor() {
    super('You must be a member of the room to view its timer', 'TIMER_NOT_MEMBER');
  }
}

export class TimerRoomNotFoundError extends NotFoundError {
  constructor() {
    super('Room not found', 'ROOM_NOT_FOUND');
  }
}

export class TimerInvalidStateError extends ConflictError {
  constructor(detail: string) {
    super(detail, 'TIMER_INVALID_STATE');
  }
}
