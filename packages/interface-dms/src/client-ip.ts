import type { RequestContext } from "@antelopejs/interface-api";
import { InterfaceFunction } from "@antelopejs/interface-core";

const FORWARDED_FOR_HEADER = "x-forwarded-for";
const FORWARDED_FOR_SEPARATOR = ",";

/** What a request exposes about the address it came from. */
export interface ClientAddressSource {
  /** The TCP peer of the request: the client, or the nearest proxy */
  socketAddress: string | undefined;
  /** The raw `x-forwarded-for` header, possibly absent */
  forwardedFor: string | undefined;
}

/**
 * The client address of a request, resolved the way the DMS resolves the
 * address it records on a session: behind the `auth.trustedProxies` reverse
 * proxies of its configuration, each trusted hop vouching for the
 * `x-forwarded-for` entry it appended and nothing left of it, with an
 * IPv4-mapped address (`::ffff:10.0.0.1`) written as plain IPv4.
 *
 * The DMS owns the proxy count, so a module asks rather than reading a
 * setting of its own the operator would have to keep in sync with it.
 *
 * @param source The socket peer and `x-forwarded-for` header of the request
 * @returns The client address, or an empty string when none is known
 */
export const ResolveClientIp =
  InterfaceFunction<(source: ClientAddressSource) => string>();

function forwardedForOf(context: RequestContext): string | undefined {
  const header = context.rawRequest.headers[FORWARDED_FOR_HEADER];
  return Array.isArray(header) ? header.join(FORWARDED_FOR_SEPARATOR) : header;
}

/**
 * The client address of the request `context` serves, through
 * {@link ResolveClientIp}: what a public route keys a rate limit or an
 * anonymous visitor on.
 *
 * @param context The request context (`@Context()` in a controller)
 * @returns The client address, or an empty string when none is known
 */
export function getClientIp(context: RequestContext): Promise<string> {
  return ResolveClientIp({
    socketAddress: context.rawRequest.socket.remoteAddress,
    forwardedFor: forwardedForOf(context),
  });
}
