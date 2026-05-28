import {
  NotFoundError,
  BadRequestError,
  ForbiddenError,
} from '../../shared/http-error';

export class AdminUserNotFoundError extends NotFoundError {
  constructor() {
    super('User not found', 'USER_NOT_FOUND');
  }
}

export class AdminCannotBanSelfError extends BadRequestError {
  constructor() {
    super('Administrators cannot ban themselves', 'CANNOT_BAN_SELF');
  }
}

export class AdminCannotBanAdminError extends ForbiddenError {
  constructor() {
    super(
      'Administrators cannot ban other administrators',
      'CANNOT_BAN_ADMIN',
    );
  }
}
