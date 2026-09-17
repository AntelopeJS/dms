// `npm publish` does not understand the pnpm `workspace:*` protocol: it ships the
// specifier verbatim and consumers cannot install the package. pnpm rewrites the
// specifier to the sibling package version while packing, so the release
// publishes through pnpm. release-it's own npm publish step is disabled with
// `npm.publish: false` in .release-it.json, and this script runs from the
// `after:bump` hook, once the new version and the changelog are written but
// before the release commit, tag and push.

import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const { name, version } = JSON.parse(
  readFileSync(join(packageRoot, "package.json"), "utf8"),
);

const prerelease = version.split("-").slice(1).join("-");
const identifier = prerelease.split(".")[0];
const tag = prerelease
  ? /^[a-z][\w-]*$/i.test(identifier)
    ? identifier
    : "next"
  : "latest";

// The working tree is dirty at this point (version bump and changelog), which is
// exactly what pnpm's git checks refuse; release-it owns the git state instead.
const args = ["publish", "--no-git-checks", "--tag", tag];
if (process.argv.includes("--dry-run")) {
  args.push("--dry-run");
}

console.log(`Publishing ${name}@${version} with tag ${tag}`);

const result = spawnSync("pnpm", args, { cwd: packageRoot, stdio: "inherit" });
if (result.error) {
  throw result.error;
}
process.exit(result.status ?? 1);
