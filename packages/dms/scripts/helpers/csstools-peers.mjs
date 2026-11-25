import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { minVersion, satisfies } from "semver";
import { z } from "zod";

const store = join(
  import.meta.dirname,
  "..",
  "..",
  "..",
  "..",
  "node_modules",
  ".pnpm",
);
const manifestPath = join(import.meta.dirname, "..", "..", "package.json");
const TOKENIZER = "@csstools/css-tokenizer";

const dmsManifest = z.object({
  dependencies: z.record(z.string(), z.string()),
});
const siblingManifest = z.object({
  peerDependencies: z.record(z.string(), z.string()).optional(),
});

/** Lists each installed @csstools sibling whose css-tokenizer peer range the lowest version dms allows misses. */
export function unmetTokenizerPeers() {
  const range = dmsManifest.parse(
    JSON.parse(readFileSync(manifestPath, "utf8")),
  ).dependencies[TOKENIZER];
  const lowest = range ? minVersion(range) : null;
  if (!range || !lowest) {
    return [`dms declares no ${TOKENIZER} range`];
  }
  /** @type {string[]} */
  const unmet = [];
  for (const dir of readdirSync(store).filter((d) =>
    d.startsWith("@csstools+css-"),
  )) {
    const name = dir
      .replace(/^@csstools\+/, "@csstools/")
      .replace(/@\d.*$/, "");
    const file = join(store, dir, "node_modules", name, "package.json");
    const peer = siblingManifest.parse(JSON.parse(readFileSync(file, "utf8")))
      .peerDependencies?.[TOKENIZER];
    if (peer && !satisfies(lowest, peer)) {
      unmet.push(`${name} needs css-tokenizer ${peer}, dms allows ${range}`);
    }
  }
  return unmet;
}
