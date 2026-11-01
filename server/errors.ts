/** Expected, client-caused failures. Thrown by handlers/services, mapped to a response once in `app.onError`. */
export class AppError extends Error {
  constructor(
    readonly status: 400 | 403 | 404 | 409 | 415,
    message: string,
  ) {
    super(message);
  }
}

class BadRequestError extends AppError {
  constructor(message: string) {
    super(400, message);
  }
}

/** One failed field of a request, in a shape clients can show next to the input. */
export interface FieldIssue {
  field: string;
  message: string;
}

/** Input that failed its schema. Carries every offending field, not just the first. */
export class ValidationError extends BadRequestError {
  constructor(readonly issues: FieldIssue[]) {
    super("invalid request");
  }
}

export class ForbiddenError extends AppError {
  constructor(message: string) {
    super(403, message);
  }
}

export class NotFoundError extends AppError {
  constructor(message = "not found") {
    super(404, message);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message);
  }
}

export class UnsupportedMediaTypeError extends AppError {
  constructor(message: string) {
    super(415, message);
  }
}
