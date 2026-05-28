import {
  ConflictError,
  UnauthorizedError,
  ForbiddenError,
} from '../../shared/http-error';

export class EmailAlreadyInUseError extends ConflictError {
  constructor() {
    super('Email is already registered', 'EMAIL_TAKEN');
  }
}

export class UsernameAlreadyInUseError extends ConflictError {
  constructor() {
    super('Username is already taken', 'USERNAME_TAKEN');
  }
}

export class InvalidCredentialsError extends UnauthorizedError {
  constructor() {
    super('Invalid email or password', 'INVALID_CREDENTIALS');
  }
}

export class AccountBannedError extends ForbiddenError {
  constructor() {
    super('Account is banned', 'ACCOUNT_BANNED');
  }
}

export class InvalidOrExpiredTokenError extends UnauthorizedError {
  constructor(detail = 'Invalid or expired token') {
    super(detail, 'INVALID_TOKEN');
  }
}

export class MissingAuthHeaderError extends UnauthorizedError {
  constructor() {
    super('Authorization header missing or malformed', 'MISSING_AUTH');
  }
}

export class InsufficientRoleError extends ForbiddenError {
  constructor() {
    super('Insufficient privileges for this action', 'INSUFFICIENT_ROLE');
  }
}
