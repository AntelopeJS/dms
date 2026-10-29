import { execFileSync, spawnSync } from "node:child_process";

/**
 * Runs git in `cwd` and returns its trimmed output.
 *
 * @param {string[]} args The git arguments
 * @param {string} cwd Where to run it
 * @returns {string} The output
 */
export function git(args, cwd) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

/**
 * The root of the git checkout holding `folder` and its HEAD, or `null`
 * values outside a checkout.
 *
 * @param {string} folder Any folder
 * @returns {{ root: string | null, head: string | null }} The checkout
 */
export function checkoutOf(folder) {
  const root = spawnSync("git", ["rev-parse", "--show-toplevel"], {
    cwd: folder,
    encoding: "utf8",
  });
  if (root.status !== 0) return { root: null, head: null };
  return {
    root: root.stdout.trim(),
    head: git(["rev-parse", "HEAD"], folder),
  };
}
