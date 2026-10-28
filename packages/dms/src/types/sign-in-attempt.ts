/**
 * `failed`: a wrong password. `alerted`: the user was told about a burst of
 * them. `reset_code`: a password-reset code was tried. `two_factor`: a code
 * was tried against a two-factor challenge. `two_factor_used`: a two-factor
 * challenge opened its session, and opens no other. `current_password`: a
 * signed-in session gave the account password again (Security page, account
 * deletion).
 */
export type SignInAttemptKind =
  | "failed"
  | "alerted"
  | "reset_code"
  | "two_factor"
  | "two_factor_used"
  | "current_password";
