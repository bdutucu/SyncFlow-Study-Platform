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
  /**
   * Optional human-readable reason recorded by the admin who issued the
   * ban. Surfaced in the JSON error body so the client can display it on
   * the login page.
   */
  public readonly reason: string | null;

  constructor(reason: string | null = null) {
    super('Account is banned', 'ACCOUNT_BANNED');
    this.reason = reason;
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
