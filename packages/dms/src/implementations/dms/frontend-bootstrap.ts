import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import { assert } from "@antelopejs/interface-api-util";
import { getFrontendConfig } from "../../config";

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
