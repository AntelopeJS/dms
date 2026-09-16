import randomstring from "randomstring";

const AUTH_KEY_LENGTH = 64;

/**
 * Mint a user's authentication key.
 *
 * The key is mixed into that user's token secret, so replacing it invalidates
 * every token and session outstanding for the account at once.
 *
 * @returns A fresh authentication key
 */
export function generateAuthKey(): string {
  return randomstring.generate({ length: AUTH_KEY_LENGTH });
}
