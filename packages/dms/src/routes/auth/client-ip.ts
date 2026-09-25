const FORWARDED_FOR_SEPARATOR = ",";

/**
 * The client address out of an `x-forwarded-for` chain: its first entry, the
 * one the client-facing proxy recorded, before every hop behind it appended
 * its own. It is recorded for display only (sessions list, sign-in notices),
 * never trusted for access control, so a client-supplied first entry is
 * acceptable where the number of proxies in front of the API is unknown.
 *
 * @param forwardedFor The raw `x-forwarded-for` header, possibly absent
 * @returns The first address of the chain, or an empty string
 */
export function clientIpFromForwardedFor(
  forwardedFor: string | undefined,
): string {
  const [first = ""] = (forwardedFor ?? "").split(FORWARDED_FOR_SEPARATOR);
  return first.trim();
}
