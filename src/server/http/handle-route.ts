import { NextResponse } from "next/server";
import { AppError, ValidationError } from "@/domain/errors";

export interface ErrorBody {
  error: { code: string; message: string; details?: unknown };
}

export function errorResponse(err: unknown): NextResponse<ErrorBody> {
  if (err instanceof AppError) {
    return NextResponse.json(
      { error: { code: err.code, message: err.message, ...(err.details !== undefined && { details: err.details }) } },
      { status: err.status },
    );
  }
  // Unknown errors are logged with detail but never leak internals to the client.
  console.error("[api] unhandled error", err);
  return NextResponse.json(
    { error: { code: "INTERNAL_ERROR", message: "Something went wrong on our side. Please try again." } },
    { status: 500 },
  );
}

/**
 * Wraps a route handler so every failure leaves the API in the same envelope:
 * `{ error: { code, message, details? } }`.
 */
export function handleRoute<Args extends unknown[]>(
  fn: (...args: Args) => Promise<Response>,
): (...args: Args) => Promise<Response> {
  return async (...args) => {
    try {
      return await fn(...args);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

/**
 * Reads a JSON body. Requires `Content-Type: application/json`, which an HTML
 * form on another site cannot send, as a second CSRF guard next to SameSite=Lax.
 * A malformed body is a 400, not a 500.
 */
export async function readJson(request: Request): Promise<unknown> {
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("application/json")) {
    throw new AppError(415, "UNSUPPORTED_MEDIA_TYPE", "Send the request body as application/json.");
  }
  try {
    return await request.json();
  } catch {
    throw new ValidationError("Request body must be valid JSON.");
  }
}
