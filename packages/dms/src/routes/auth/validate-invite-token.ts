import { authSchema } from "../../validation";
import { resolveValidInvite } from "./invite";

/**
 * Check an invitation link before its signup form is filled: the same check
 * the signup runs, so the page refuses exactly what the signup would.
 */
export async function validateInviteToken(
  body: ReturnType<typeof authSchema.validateInviteToken.parse>,
): Promise<void> {
  const { token, email } = body;
  await resolveValidInvite(token, email);
}
