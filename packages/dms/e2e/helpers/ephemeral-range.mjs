import { readFileSync } from "node:fs";

/** The file that holds the kernel's ephemeral port range */
export const EPHEMERAL_RANGE_FILE = "/proc/sys/net/ipv4/ip_local_port_range";

/**
 * The kernel's ephemeral port range, the ports it gives an outgoing
 * connection or a `listen(0)`.
 *
 * @returns {{ low: number, high: number }} Its first and last port
 */
export function ephemeralRange() {
  const [low, high] = readFileSync(EPHEMERAL_RANGE_FILE, "utf8")
    .trim()
    .split(/\s+/)
    .map(Number);
  return { low, high };
}
