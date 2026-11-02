import type { z } from "zod";

/** The part of an HTTP client response that a body parse reads. */
export interface BodyResponse {
  status: number;
  data: unknown;
}

/**
 * Parses a response body against `schema`. A body of another shape fails the
 * test with the status and the body, instead of passing as an unchecked type.
 */
export function parseBody<Body>(
  schema: z.ZodType<Body, z.ZodTypeDef, unknown>,
  response: BodyResponse,
): Body {
  const parsed = schema.safeParse(response.data);
  if (!parsed.success) {
    throw new Error(
      `Response [${response.status}] does not match its schema (${parsed.error.message}): ${JSON.stringify(response.data)}`,
    );
  }
  return parsed.data;
}
