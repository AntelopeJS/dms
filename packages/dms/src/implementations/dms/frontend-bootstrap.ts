import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { type BootstrapEnforcement, getFrontendConfig } from "../../config";

const HTTP_UNAUTHORIZED = 401;
const BOOTSTRAP_REQUIRED_MESSAGE = "error.frontend.bootstrap_required";
const EPHEMERAL_SECRET_BYTES = 32;

export const BOOTSTRAP_HEADER = "x-dms-bootstrap";

/**
 * Whether the caller of a layer endpoint proved it is an instance build tool.
 */
export type BootstrapOutcome = "authenticated" | "anonymous";

let ephemeralDevSecret: string | undefined;

/**
 * Give a development instance a credential without asking anyone to configure
 * one. The value is regenerated on every boot and only ever leaves through the
 * same-machine handshake file, so it cannot outlive the process that made it.
 *
 * @param dev Whether the project runs in development mode
 */
export function initFrontendBootstrapSecret(dev: boolean): void {
  if (!dev || getFrontendConfig().bootstrapSecret?.trim()) return;
  ephemeralDevSecret = randomBytes(EPHEMERAL_SECRET_BYTES).toString("hex");
}

export function getFrontendBootstrapSecret(): string | undefined {
  return getFrontendConfig().bootstrapSecret?.trim() || ephemeralDevSecret;
}

/**
 * Whether an operator deliberately gave this instance a layer credential.
 *
 * Deliberately blind to {@link ephemeralDevSecret}: the ephemeral value exists
 * so development needs no configuration at all, and letting it close the gate
 * would turn a convenience into a surprise 401 for every local tool that is
 * not the build tool.
 */
export function hasConfiguredFrontendBootstrapSecret(): boolean {
  return Boolean(getFrontendConfig().bootstrapSecret?.trim());
}

function digest(value: string): Buffer {
  return createHash("sha256").update(value, "utf8").digest();
}

/**
 * Compare a presented credential against the instance's, in constant time.
 *
 * Unlike `assertOAuthRelay`, which length-guards before comparing raw
 * bytes, this compares digests: the relay secret is a fixed-length hex string
 * whose length leaks nothing, while this one is operator-chosen, so an early
 * length return would tell an unauthenticated caller how long it is. Hashing
 * both sides makes them 32 bytes each and removes the guard.
 *
 * The empty-side check is what stops an instance with no configured secret
 * from accepting a caller that presents nothing.
 *
 * @param presented Credential the caller sent, if any
 * @param expected Instance credential; injectable because the config merge is
 *                 additive and tests cannot unset it
 * @returns Whether the caller presented the instance credential
 */
export function matchesFrontendBootstrap(
  presented: string | undefined,
  expected: string | undefined = getFrontendBootstrapSecret(),
): boolean {
  if (!expected || !presented) return false;
  return timingSafeEqual(digest(expected), digest(presented));
}

export function resolveBootstrapOutcome(
  presented: string | undefined,
): BootstrapOutcome {
  return matchesFrontendBootstrap(presented) ? "authenticated" : "anonymous";
}

/**
 * What to do with a caller of a layer endpoint.
 *
 * `allow` presented the instance credential. `refuse` did not, on an instance
 * that gates these routes. `degrade` did not, on an instance that does not
 * gate them: the response is still served, minus every secret-bearing field.
 */
export type LayerAccessDecision = "allow" | "refuse" | "degrade";

/**
 * Decide how a layer endpoint answers this caller.
 *
 * A configured `frontend.bootstrapSecret` closes the gate on its own, whatever
 * `frontend.requireBootstrap` says: an operator who sets a credential has asked
 * for these routes to be private, and a credential that is collected but never
 * enforced is worse than none — it reads as protection while
 * `GET /dms/frontend/modules` still streams the source of every frontend
 * module to anyone who can reach the backend. `requireBootstrap` therefore only
 * decides the no-credential case, where `enforce` closes the routes to
 * everyone and the default `warn` serves them stripped.
 *
 * @param outcome Result of {@link resolveBootstrapOutcome} for this request
 * @param hasConfiguredSecret Whether a credential is configured; injectable
 *                            because the config merge is additive and tests
 *                            cannot unset it
 * @param enforcement Value of `frontend.requireBootstrap`
 */
export function decideLayerAccess(
  outcome: BootstrapOutcome,
  hasConfiguredSecret: boolean = hasConfiguredFrontendBootstrapSecret(),
  enforcement: BootstrapEnforcement = getFrontendConfig().requireBootstrap ??
    "warn",
): LayerAccessDecision {
  if (outcome === "authenticated") return "allow";
  if (hasConfiguredSecret || enforcement === "enforce") return "refuse";
  return "degrade";
}

/**
 * Refuse a layer endpoint call that carries no valid credential.
 *
 * @param outcome Result of {@link resolveBootstrapOutcome} for this request
 */
export function assertFrontendBootstrap(outcome: BootstrapOutcome): void {
  assert(
    outcome === "authenticated",
    HTTP_UNAUTHORIZED,
    BOOTSTRAP_REQUIRED_MESSAGE,
  );
}
