import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const JSON_INDENT = 2;
const CHECK_FLAG = "--check";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(packageRoot, "docs-data", "blocks.json");

async function readCatalog() {
  const { version } = JSON.parse(
    readFileSync(join(packageRoot, "package.json"), "utf8"),
  );
  const { ListBlockTypes } =
    await import("@antelopejs/interface-dms/base/block-types");
  const { BlockPresentationPaths } =
    await import("@antelopejs/interface-dms/base/block-registry/presentation");
  const blocks = [...ListBlockTypes()].sort((left, right) =>
    left.type < right.type ? -1 : 1,
  );
  return {
    schemaVersion: SCHEMA_VERSION,
    dmsVersion: version,
    blocks: blocks.map((block) => ({
      ...block,
      presentation: { version: 1, paths: BlockPresentationPaths(block) },
    })),
  };
}

/** @param {object} catalog */
function serialize(catalog) {
  return `${JSON.stringify(catalog, null, JSON_INDENT)}\n`;
}

/** @param {string} expected */
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

const expected = serialize(await readCatalog());
if (process.argv.includes(CHECK_FLAG)) {
  check(expected);
} else {
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, expected);
  console.log(`Wrote ${relative(process.cwd(), catalogPath)}`);
}
