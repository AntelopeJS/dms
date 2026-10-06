// Which sign-ins are worth a "new device" alert. Pure: the store
// (sign-in-monitor.ts) reads the history and sends the notification.

import type { ParsedUserAgent } from "@antelopejs/interface-dms/auth";

const FINGERPRINT_SEPARATOR = "|";
/** Browser, system and device type: the parts every fingerprint starts with. */
const DEVICE_PART_COUNT = 3;

/** The browser and system a sign-in came from, as the alert names them. */
export interface SignInDevice {
  /**
   * Browser, system and device type, without versions, then the country
   * when it is known.
   */
  fingerprint: string;
  browser: string;
  os: string;
  /** Upper-case ISO 3166-1 alpha-2 code of the country, when known. */
  country?: string;
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

interface FingerprintParts {
  device: string;
  country?: string;
}

/**
 * Versions stay out of the fingerprint: a browser or system update is the
 * same device, and alerting on it would bring the noise back.
 *
 * @param parsed The parsed user agent
 * @param country Country of the sign-in, when known
 */
export function describeSignInDevice(
  parsed: ParsedUserAgent,
  country?: string,
): SignInDevice {
  const browser = parsed.browserName.trim();
  const os = parsed.osName.trim();
  const parts = [browser, os, parsed.deviceType];
  if (country) parts.push(country);
  const fingerprint = parts
    .map((part) => part.toLowerCase())
    .join(FINGERPRINT_SEPARATOR);
  return { fingerprint, browser, os, country };
}

function splitFingerprint(fingerprint: string): FingerprintParts {
  const parts = fingerprint.split(FINGERPRINT_SEPARATOR);
  return {
    device: parts.slice(0, DEVICE_PART_COUNT).join(FINGERPRINT_SEPARATOR),
    country: parts[DEVICE_PART_COUNT] || undefined,
  };
}

// A sign-in whose country is unknown is matched on its device alone, as before
// countries were read. One with a country needs that device seen from that
// same country: an entry without one cannot vouch for it.
function vouchesFor(entry: string, signIn: FingerprintParts): boolean {
  const known = splitFingerprint(entry);
  return (
    known.device === signIn.device &&
    (signIn.country === undefined || known.country === signIn.country)
  );
}

export function classifySignIn(
  fingerprint: string,
  history: SignInHistory,
): SignInKind {
  const signIn = splitFingerprint(fingerprint);
  const isKnown = [
    ...history.knownFingerprints,
    ...history.sessionFingerprints,
  ].some((entry) => vouchesFor(entry, signIn));
  if (isKnown) return "known";
  const hasHistory =
    history.hasBeenActive ||
    history.knownFingerprints.length > 0 ||
    history.sessionFingerprints.length > 0;
  return hasHistory ? "new" : "first";
}
