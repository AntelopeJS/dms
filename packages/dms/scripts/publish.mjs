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
