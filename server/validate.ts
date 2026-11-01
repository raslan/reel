import type * as z from "zod";
import { ValidationError } from "./errors";

/** Validate untrusted input (query, body) against `schema`; throws a `ValidationError` listing every bad field. */
export function parse<S extends z.ZodType>(schema: S, input: unknown): z.output<S> {
  const result = schema.safeParse(input);
  if (result.success) return result.data;
  throw new ValidationError(
    // An issue with no path concerns the whole input (e.g. a body that isn't an object).
    result.error.issues.map((i) => ({ field: i.path.join(".") || "(request)", message: i.message })),
  );
}
