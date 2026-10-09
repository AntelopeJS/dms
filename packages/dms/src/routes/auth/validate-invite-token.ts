import { assertValidation } from "@antelopejs/interface-api-util";
import { authSchema } from "../../validation/auth.schema";
import { resolveValidInvite } from "./invite";

/**
 * Check an invitation link before its signup form is filled: the same check
 * the signup runs, so the page refuses exactly what the signup would.
 */
export async function validateInviteToken(body: unknown): Promise<void> {
  const { token, email } = assertValidation(body, (v) =>
    authSchema.validateInviteToken.parse(v),
  );
  await resolveValidInvite(token, email);
}
