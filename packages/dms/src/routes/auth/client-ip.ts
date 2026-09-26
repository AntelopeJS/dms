import { isIPv4 } from "node:net";
import type { AuthConfig } from "../../config";

const FORWARDED_FOR_SEPARATOR = ",";
const IPV4_MAPPED_PREFIX = "::ffff:";
const NO_TRUSTED_PROXY = 0;
const LEGACY_TRUST_PROXY_HOPS = 1;

/** What a request exposes about the address it came from. */
export interface ClientAddressSource {
  /** The TCP peer of the request: the client, or the nearest proxy */
  socketAddress: string | undefined;
  /** The raw `x-forwarded-for` header, possibly absent */
  forwardedFor: string | undefined;
}

/**
 * Presents an IPv4 address the same way whether it arrived over an IPv4 or a
 * dual-stack socket, where Node reports it IPv4-mapped (`::ffff:10.0.0.1`).
 */
function normalizeAddress(address: string): string {
  const unmapped = address.slice(IPV4_MAPPED_PREFIX.length);
  const isMappedIPv4 =
    address.toLowerCase().startsWith(IPV4_MAPPED_PREFIX) && isIPv4(unmapped);
  return isMappedIPv4 ? unmapped : address;
}

function forwardedAddressesNearestFirst(
  forwardedFor: string | undefined,
): string[] {
  return (forwardedFor ?? "")
    .split(FORWARDED_FOR_SEPARATOR)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .reverse();
}

/**
 * The client address of a request behind `trustedProxies` reverse proxies.
 *
 * Walks back from the socket peer through the `x-forwarded-for` chain, one
 * trusted hop at a time: each trusted proxy vouches for the entry it appended,
 * nothing more. With no trusted proxy the header is ignored altogether, since
 * any caller can write it; entries left of the ones trusted proxies appended
 * are client-supplied and never reached. A chain shorter than configured
 * yields its leftmost entry.
 *
 * @param source The socket peer and `x-forwarded-for` header of the request
 * @param trustedProxies Number of proxies in front that append to the header
 * @returns The client address, or an empty string when none is known
 */
export function resolveClientIp(
  source: ClientAddressSource,
  trustedProxies: number,
): string {
  const addresses = [
    source.socketAddress ?? "",
    ...forwardedAddressesNearestFirst(source.forwardedFor),
  ];
  const index = Math.min(trustedProxies, addresses.length - 1);
  return normalizeAddress(addresses[index]);
}

function isProxyCount(value: unknown): value is number {
  return (
    typeof value === "number" &&
    Number.isSafeInteger(value) &&
    value >= NO_TRUSTED_PROXY
  );
}

/**
 * The trusted proxy hop count an auth config declares: `trustedProxies`, or
 * one hop for the deprecated `oauth.trustProxy`, or none.
 *
 * @param authConfig The resolved auth configuration
 * @returns A non-negative integer
 */
export function trustedProxyCount(authConfig: AuthConfig): number {
  if (isProxyCount(authConfig.trustedProxies)) return authConfig.trustedProxies;
  return authConfig.oauth?.trustProxy
    ? LEGACY_TRUST_PROXY_HOPS
    : NO_TRUSTED_PROXY;
}
