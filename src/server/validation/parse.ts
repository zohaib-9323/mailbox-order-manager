import type { z } from "zod";
import { ValidationError } from "@/domain/errors";

/** Parse with a zod schema, converting failures into our 400 ValidationError. */
export function parseOrThrow<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  const fieldErrors: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = issue.path.join(".") || "_";
    fieldErrors[key] ??= issue.message;
  }
  const first = result.error.issues[0]?.message ?? "Invalid input.";
  throw new ValidationError(first, { fields: fieldErrors });
}
