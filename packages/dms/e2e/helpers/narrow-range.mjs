import { spawnSync } from "node:child_process";
import { EPHEMERAL_RANGE_FILE } from "./ephemeral-range.mjs";

const NARROW_RANGE = "40000 40007";
const TIMEOUT_MS = 30_000;
const SETUP = `ip link set lo up && echo "${NARROW_RANGE}" > ${EPHEMERAL_RANGE_FILE}`;

/** @returns {boolean} True where a test may make a user and network namespace with a loopback interface and set its ephemeral range */
export function canNarrowRange() {
  return spawnSync("unshare", ["-rn", "sh", "-c", SETUP]).status === 0;
}

/**
 * Runs an ES module script with Node in a new network namespace whose
 * loopback is up and whose ephemeral range is eight ports wide.
 *
 * @param {string} script The module's source
 * @param {string} argument What the script reads as `process.argv[1]`
 * @returns {import("node:child_process").SpawnSyncReturns<string>} How it ended and what it printed
 */
export function runInNarrowRange(script, argument) {
  return spawnSync(
    "unshare",
    [
      "-rn",
      "sh",
      "-c",
      `${SETUP} && exec "$0" --input-type=module -e "$1" "$2"`,
      process.execPath,
      script,
      argument,
    ],
    { encoding: "utf8", timeout: TIMEOUT_MS },
  );
}
