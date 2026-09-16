import { createHmac, timingSafeEqual } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { getAuthConfig } from "../../../config";

const HTTP_UNAUTHORIZED = 401;
const HTTP_INTERNAL_ERROR = 500;
const RELAY_REQUIRED_MESSAGE = "error.oauth.relay_required";
const JWT_SECRET_MISSING_MESSAGE = "error.oauth.jwt_secret_missing";

const RELAY_DERIVATION_MESSAGE = "oauth-relay";

/**
 * Secret the browser-facing layer must present to reach the OAuth endpoints.
 *
 * Derived from the instance's `jwtSecret`, so instances configure nothing new.
 * It travels to the frontend as an `AddFrontendModule` private option, which the
 * manifest endpoint serves only to a caller holding the instance's bootstrap
 * credential — so it reaches the frontend server and nothing else, and never
 * any browser.
 *
 * That is what makes the OAuth endpoints BFF-only: the CSRF cookie check lives
 * in the layer that owns the cookie, and this secret is what stops a direct
 * API caller from standing in for that layer and self-certifying the proof.
 *
 * @returns The relay secret shared with the instance's frontend servers
 */
export function deriveOAuthRelaySecret(): string {
  return createHmac("sha256", getAuthConfig().jwtSecret)
    .update(RELAY_DERIVATION_MESSAGE)
    .digest("hex");
}

/**
 * Refuse an OAuth endpoint call that does not come from an instance frontend
 * server.
 *
 * @param relayHeader Value of the relay header the caller presented
 */
export function assertOAuthRelay(relayHeader: string | undefined): void {
  assert(
    getAuthConfig().jwtSecret,
    HTTP_INTERNAL_ERROR,
    JWT_SECRET_MISSING_MESSAGE,
  );

  const expected = Buffer.from(deriveOAuthRelaySecret());
  const presented = Buffer.from(relayHeader ?? "");
  assert(
    expected.length === presented.length &&
      timingSafeEqual(expected, presented),
    HTTP_UNAUTHORIZED,
    RELAY_REQUIRED_MESSAGE,
  );
}
