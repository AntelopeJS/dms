import { existsSync, readFileSync } from "node:fs";

/**
 * Refuses a dashboard that did not bind its port: another server answered the
 * readiness probe in its place.
 *
 * @param {{ log: string }} frontend The dashboard's process record
 * @throws When its log says its port is already in use
 */
export function assertFrontendBound(frontend) {
  const log = existsSync(frontend.log)
    ? readFileSync(frontend.log, "utf8")
    : "";
  const refusal = /Port \d+ is already in use/.exec(log);
  if (refusal) throw new Error(`${refusal[0]}; see ${frontend.log}`);
}
