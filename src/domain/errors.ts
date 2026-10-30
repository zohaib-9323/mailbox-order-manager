/**
 * Application error model. Every error the API returns is one of these, so the
 * HTTP layer only has to map `status` + `code` into the response envelope.
 */
export class AppError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly details?: unknown,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(400, "VALIDATION_ERROR", message, details);
  }
}

export class UnauthorizedError extends AppError {
  constructor(message = "You need to sign in.") {
    super(401, "UNAUTHORIZED", message);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "You do not have access to this action.") {
    super(403, "FORBIDDEN", message);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, "NOT_FOUND", `${resource} not found.`);
  }
}

export class InvalidTransitionError extends AppError {
  constructor(from: string, to: string, reason: string) {
    super(409, "INVALID_TRANSITION", `Cannot move order from ${from} to ${to}: ${reason}`, { from, to });
  }
}

/** The row changed underneath us (optimistic concurrency check failed). */
export class ConcurrentModificationError extends AppError {
  constructor(message = "The order was changed by someone else. Reload and try again.") {
    super(409, "CONCURRENT_MODIFICATION", message);
  }
}

export class IdempotencyKeyReusedError extends AppError {
  constructor() {
    super(
      422,
      "IDEMPOTENCY_KEY_REUSED",
      "This Idempotency-Key was already used for a different order. Use a new key for a new order.",
    );
  }
}
