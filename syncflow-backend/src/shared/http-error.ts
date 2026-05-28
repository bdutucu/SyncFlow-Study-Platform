/**
 * HTTP-aware error hierarchy. Throw subclasses anywhere in service code; the
 * centralised Express error handler (src/server.ts) maps them to JSON
 * responses. Anything else becomes a 500.
 */

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    message: string,
    public readonly code?: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export class BadRequestError extends HttpError {
  constructor(message = 'Bad request', code?: string) {
    super(400, message, code);
  }
}

export class UnauthorizedError extends HttpError {
  constructor(message = 'Unauthorized', code?: string) {
    super(401, message, code);
  }
}

export class ForbiddenError extends HttpError {
  constructor(message = 'Forbidden', code?: string) {
    super(403, message, code);
  }
}

export class NotFoundError extends HttpError {
  constructor(message = 'Not found', code?: string) {
    super(404, message, code);
  }
}

export class ConflictError extends HttpError {
  constructor(message = 'Conflict', code?: string) {
    super(409, message, code);
  }
}
