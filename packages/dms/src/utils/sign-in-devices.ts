// Which sign-ins are worth a "new device" alert. Pure: the store
// (sign-in-monitor.ts) reads the history and sends the notification.

import type { ParsedUserAgent } from "@antelopejs/interface-dms/auth";

const FINGERPRINT_SEPARATOR = "|";

/** The browser and system a sign-in came from, as the alert names them. */
export interface SignInDevice {
  /** Browser, system and device type, without versions. */
  fingerprint: string;
  browser: string;
  os: string;
}

/** What is already known about where an account signs in from. */
export interface SignInHistory {
  /** Devices remembered from earlier sign-ins. */
  knownFingerprints: readonly string[];
  /** Devices of the sessions still open. */
  sessionFingerprints: readonly string[];
  /** The account was used before (`User.lastActiveAt` is set). */
  hasBeenActive: boolean;
}

/**
 * `known`: seen before, nothing to say. `first`: the account's very first
 * sign-in, which the welcome notification already covers. `new`: alert.
 */
export type SignInKind = "known" | "first" | "new";

/**
 * Versions stay out of the fingerprint: a browser or system update is the
 * same device, and alerting on it would bring the noise back.
 */
export function describeSignInDevice(parsed: ParsedUserAgent): SignInDevice {
  const browser = parsed.browserName.trim();
  const os = parsed.osName.trim();
  const fingerprint = [browser, os, parsed.deviceType]
    .map((part) => part.toLowerCase())
    .join(FINGERPRINT_SEPARATOR);
  return { fingerprint, browser, os };
}

export function classifySignIn(
  fingerprint: string,
  history: SignInHistory,
): SignInKind {
  if (
    history.knownFingerprints.includes(fingerprint) ||
    history.sessionFingerprints.includes(fingerprint)
  ) {
    return "known";
  }
  const hasHistory =
    history.hasBeenActive ||
    history.knownFingerprints.length > 0 ||
    history.sessionFingerprints.length > 0;
  return hasHistory ? "new" : "first";
}
