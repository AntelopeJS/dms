import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const SCHEMA_VERSION = 1;
const JSON_INDENT = 2;
const CHECK_FLAG = "--check";

const packageRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const catalogPath = join(packageRoot, "docs-data", "blocks.json");
const docsRoot = join(packageRoot, "docs");

const FENCE = /^ {0,3}(`{3,}|~{3,})[^\n]*\n[\s\S]*?^ {0,3}\1[`~]*[ \t]*$/gm;
const DIRECTIVE = /^::block-(playground|options)\{([^}\n]*)\}/gm;
const ATTRIBUTE = /([\w-]+)="([^"]*)"/g;

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

/**
 * @param {string} directory
 * @returns {string[]}
 */
function listPages(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return listPages(path);
    return entry.name.endsWith(".md") ? [path] : [];
  });
}

/**
 * The block types a page shows live and the block types it tabulates. A
 * playground names its type with `type` or `example`: `type="Spacer"` renders
 * an empty gap, so the Spacer page names it with `example`. Directives in code
 * fences are examples of the syntax and count for nothing.
 * @param {string} source
 */
function directiveTypes(source) {
  /** @type {Set<string>} */
  const playgrounds = new Set();
  /** @type {Set<string>} */
  const options = new Set();
  for (const [, kind, attributes] of source
    .replace(FENCE, "")
    .matchAll(DIRECTIVE)) {
    for (const [, name, value] of attributes.matchAll(ATTRIBUTE)) {
      if (kind === "playground" && (name === "type" || name === "example"))
        playgrounds.add(value);
      if (kind === "options" && name === "type") options.add(value);
    }
  }
  return { playgrounds, options };
}

/**
 * Which pages document each type: those that hold both its playground and its
 * options table.
 * @param {readonly string[]} types
 * @returns {Map<string, string[]>}
 */
function documentingPages(types) {
  const pages = existsSync(docsRoot) ? listPages(docsRoot).sort() : [];
  /** @type {Map<string, string[]>} */
  const byType = new Map(types.map((type) => [type, []]));
  for (const page of pages) {
    const { playgrounds, options } = directiveTypes(readFileSync(page, "utf8"));
    for (const type of playgrounds) {
      if (options.has(type))
        byType.get(type)?.push(relative(process.cwd(), page));
    }
  }
  return byType;
}

/**
 * @param {readonly string[]} types
 * @returns {string[]}
 */
function pageProblems(types) {
  return [...documentingPages(types)].flatMap(([type, pages]) => {
    if (pages.length === 1) return [];
    return pages.length === 0
      ? [
          `${type}: no page holds both its block-playground and its block-options`,
        ]
      : [
          `${type}: ${pages.length} pages hold both directives: ${pages.join(", ")}`,
        ];
  });
}

/** @param {object} catalog */
function serialize(catalog) {
  return `${JSON.stringify(catalog, null, JSON_INDENT)}\n`;
}

/**
 * @param {string} expected
 * @param {readonly string[]} types
 */
function check(expected, types) {
  const shown = relative(process.cwd(), catalogPath);
  const current = existsSync(catalogPath)
    ? readFileSync(catalogPath, "utf8")
    : "";
  const problems = pageProblems(types);
  if (current !== expected) {
    problems.unshift(
      `${shown} is stale: run \`pnpm --dir packages/dms docs:catalog\` and commit it`,
    );
  }
  if (problems.length) {
    console.error(problems.join("\n"));
    process.exit(1);
  }
  console.log(`${shown} is up to date and every block type has one page`);
}

const catalog = await readCatalog();
const expected = serialize(catalog);
if (process.argv.includes(CHECK_FLAG)) {
  check(
    expected,
    catalog.blocks.map(({ type }) => type),
  );
} else {
  mkdirSync(dirname(catalogPath), { recursive: true });
  writeFileSync(catalogPath, expected);
  console.log(`Wrote ${relative(process.cwd(), catalogPath)}`);
}
