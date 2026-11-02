import { spawnSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readJsonRecord, text } from "./helpers/json-record.mjs";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const manifest = readJsonRecord(join(packageRoot, "package.json"));
const name = text(manifest, "name");
const version = text(manifest, "version");

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
