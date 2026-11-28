import { spawnSync } from "node:child_process";
import { EPHEMERAL_RANGE_FILE } from "./ephemeral-range.mjs";

const NARROW_RANGE = "40000 40007";
const TIMEOUT_MS = 30_000;
/**
 * @param {string} range The ephemeral range, its first and last port
 * @returns {string} The shell command that sets the namespace up
 */
const setup = (range) =>
  `ip link set lo up && echo "${range}" > ${EPHEMERAL_RANGE_FILE}`;

/** @returns {boolean} True where a test may make a user and network namespace with a loopback interface and set its ephemeral range */
export function canNarrowRange() {
  return (
    spawnSync("unshare", ["-rn", "sh", "-c", setup(NARROW_RANGE)]).status === 0
  );
}

/**
 * Runs an ES module script with Node in a new network namespace whose
 * loopback is up and whose ephemeral range is `range`, eight ports wide
 * by default.
 *
 * @param {string} script The module's source
 * @param {string} argument What the script reads as `process.argv[1]`
 * @param {string} [range] The ephemeral range, its first and last port
 * @returns {import("node:child_process").SpawnSyncReturns<string>} How it ended and what it printed
 */
export function runInNarrowRange(script, argument, range = NARROW_RANGE) {
  return spawnSync(
    "unshare",
    [
      "-rn",
      "sh",
      "-c",
      `${setup(range)} && exec "$0" --input-type=module -e "$1" "$2"`,
      process.execPath,
      script,
      argument,
    ],
    { encoding: "utf8", timeout: TIMEOUT_MS },
  );
}
