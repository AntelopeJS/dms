import { assert } from "@antelopejs/interface-api-util";
import { AttemptLimiter } from "../../utils/attempt-limiter";

const HTTP_TOO_MANY_REQUESTS = 429;
const TOO_MANY_ATTEMPTS_MESSAGE = "error.too_many_sign_in_attempts";
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
/** Wrong passwords one address (account) may take per window. */
const FAILURES_PER_ACCOUNT = 10;
/** Failed sign-ins one client address may make per window, all accounts. */
const FAILURES_PER_CLIENT = 50;
const MAX_TRACKED_KEYS = 10_000;

// Keyed on the typed address, not on the account: an unknown address is
// throttled the same, so the refusal tells nothing about which ones exist.
const accountFailures = new AttemptLimiter(
  FAILURES_PER_ACCOUNT,
  LOGIN_WINDOW_MS,
  MAX_TRACKED_KEYS,
);
const clientFailures = new AttemptLimiter(
  FAILURES_PER_CLIENT,
  LOGIN_WINDOW_MS,
  MAX_TRACKED_KEYS,
);

/**
 * Refuses a sign-in, before any password is checked, once its address or
 * its client used up their failures for the window.
 *
 * @param email The normalized address typed
 * @param ip The client address, empty when unknown
 */
export function assertLoginAllowed(
  email: string,
  ip: string,
  now = Date.now(),
): void {
  const isBlocked =
    accountFailures.isBlocked(email, now) ||
    (ip !== "" && clientFailures.isBlocked(ip, now));
  assert(!isBlocked, HTTP_TOO_MANY_REQUESTS, TOO_MANY_ATTEMPTS_MESSAGE);
}

/** Counts a sign-in refused for an unknown address or a wrong password. */
export function recordLoginFailure(
  email: string,
  ip: string,
  now = Date.now(),
): void {
  accountFailures.recordFailure(email, now);
  if (ip !== "") clientFailures.recordFailure(ip, now);
}

/** Forgets an address's failures once its password was given. */
export function clearLoginFailures(email: string): void {
  accountFailures.reset(email);
}
