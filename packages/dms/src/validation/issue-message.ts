import { ZodError } from "zod";

/**
 * An `assertValidation` error handler answering with the first issue's
 * message, for a schema whose messages are i18n keys. Without it the whole
 * `ZodError` is stringified, which no client can translate.
 */
export function firstIssueMessage(error: unknown): string {
  const [issue] = error instanceof ZodError ? error.issues : [];
  return issue ? issue.message : String(error);
}
