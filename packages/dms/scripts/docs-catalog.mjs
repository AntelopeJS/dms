// Writes docs-data/blocks.json, the block catalog the documentation site builds
// its option tables and preview controls from: every registered block type as
// `ListBlockTypes()` describes it, sorted by type. `--check` only compares, and
// fails when the committed file no longer matches the registry.
//
// Reads the interface's build, so `pnpm --dir packages/interface-dms build`
// has to run first.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const JSON_INDENT = 2;
const CHECK_FLAG = "--check";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(packageRoot, "docs-data", "blocks.json");
const require = createRequire(join(packageRoot, "package.json"));

function readCatalog() {
  const { version } = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  // The barrel registers every built-in block type as it loads.
  const {
    ListBlockTypes,
  } = require("@antelopejs/interface-dms/base/block-types");
  // Code-point order, not `localeCompare`: the file must not depend on the
  // locale of the machine writing it.
  const blocks = [...ListBlockTypes()].sort((left, right) =>
    left.type < right.type ? -1 : 1,
  );
  return { schemaVersion: SCHEMA_VERSION, dmsVersion: version, blocks };
}

function serialize(catalog) {
  return `${JSON.stringify(catalog, null, JSON_INDENT)}\n`;
}

function check(expected) {
  const shown = relative(process.cwd(), catalogPath);
  const current = existsSync(catalogPath)
    ? readFileSync(catalogPath, "utf8")
    : "";
  if (current === expected) {
    console.log(`${shown} is up to date`);
    return;
  }
  console.error(
    `${shown} is stale: run \`pnpm --dir packages/dms docs:catalog\` and commit it`,
  );
  process.exit(1);
}

const expected = serialize(readCatalog());
if (process.argv.includes(CHECK_FLAG)) {
  check(expected);
} else {
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, expected);
  console.log(`Wrote ${relative(process.cwd(), catalogPath)}`);
}
