/**
 * The DMS password policy, shared by every flow that sets a password: the DMS
 * signup, admin onboarding and password recovery, and any module owning its
 * own registration flow (a SaaS public signup, for instance). Plain values and
 * a pure function: nothing here needs the DMS to be loaded.
 */

/** Minimum number of characters a password must have. */
export const PASSWORD_MIN_LENGTH = 8;

/**
 * The special characters a password may contain. A password needs at least
 * one of them, and no other non-alphanumeric character is allowed.
 */
const ALLOWED_SPECIAL_CHARS = "@$!%*?&";

/**
 * The character rules of the policy, without the length: at least one
 * uppercase letter, one digit and one of `@$!%*?&`, and only ASCII letters,
 * digits and those special characters.
 */
export const PASSWORD_PATTERN = new RegExp(
  `^(?=.*[A-Z])(?=.*\\d)(?=.*[${ALLOWED_SPECIAL_CHARS}])[A-Za-z\\d${ALLOWED_SPECIAL_CHARS}]+$`,
);

/**
 * Whether a password satisfies the DMS password policy: at least
 * `PASSWORD_MIN_LENGTH` characters and every rule of `PASSWORD_PATTERN`.
 *
 * @param password Candidate password, in clear
 * @returns True when the DMS would accept the password
 */
export function isPasswordCompliant(password: string): boolean {
  return (
    password.length >= PASSWORD_MIN_LENGTH && PASSWORD_PATTERN.test(password)
  );
}
