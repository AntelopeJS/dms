import { isIP, isIPv4 } from "node:net";
import type { ClientAddressSource } from "@antelopejs/interface-dms/client-ip";
import type { AuthConfig } from "../config";

const FORWARDED_FOR_SEPARATOR = ",";
const IPV4_MAPPED_PREFIX = "::ffff:";
const NO_TRUSTED_PROXY = 0;

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

/**
 * The header name `auth.clientIpHeader` declares, lowercased as Node keys
 * request headers, or none when unset or blank.
 */
function clientIpHeaderName(authConfig: AuthConfig): string | undefined {
  const name = authConfig.clientIpHeader?.trim().toLowerCase();
  return name ? name : undefined;
}

/** A single, valid IP address the header carries, or none. */
function headerAddress(
  value: string | string[] | undefined,
): string | undefined {
  // oxlint-disable-next-line anti-slop/no-runtime-typeof -- Node's header owner type includes arrays and undefined; the existing single-address policy rejects both before trimming.
  if (typeof value !== "string") return undefined;
  const address = normalizeAddress(value.trim());
  return isIP(address) ? address : undefined;
}

/**
 * The client address of a request under an auth config.
 *
 * With `auth.clientIpHeader` set, the address is that header's, which the
 * hosting platform overwrites on every request (AntelopeJS Cloud:
 * `X-Client-IP`). A request without it, or with anything but one IP address
 * in it, falls back to the socket peer, never to `x-forwarded-for`. Without
 * the option, `trustedProxies` reverse proxies are walked back as in
 * {@link resolveClientIp}.
 *
 * @param source The socket peer and headers of the request
 * @param authConfig The resolved auth configuration
 * @returns The client address, or an empty string when none is known
 */
export function resolveRequestClientIp(
  source: ClientAddressSource,
  authConfig: AuthConfig,
): string {
  const name = clientIpHeaderName(authConfig);
  if (!name) return resolveClientIp(source, trustedProxyCount(authConfig));
  return (
    headerAddress(source.headers?.[name]) ??
    normalizeAddress(source.socketAddress ?? "")
  );
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
 * none.
 *
 * @param authConfig The resolved auth configuration
 * @returns A non-negative integer
 */
export function trustedProxyCount(authConfig: AuthConfig): number {
  return isProxyCount(authConfig.trustedProxies)
    ? authConfig.trustedProxies
    : NO_TRUSTED_PROXY;
}
