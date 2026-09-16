// Node does not fall back to a directory index inside an `exports` map, and a
// `./*` pattern only matches files. Every directory index therefore needs its
// own entry, and forgetting one is invisible until a consumer imports it. This
// asserts the map covers the built output, and that each entry resolves.
import { createRequire } from "node:module";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const manifest = JSON.parse(
  fs.readFileSync(path.join(packageRoot, "package.json"), "utf8"),
);
const distRoot = path.join(packageRoot, "dist");

if (!fs.existsSync(distRoot)) {
  throw new Error("dist is missing: run `pnpm run build` first.");
}

function listFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    return entry.isDirectory() ? listFiles(full) : [full];
  });
}

function toSubpath(file) {
  const relative = path
    .relative(distRoot, file)
    .split(path.sep)
    .join("/")
    .replace(/\.js$/, "");
  return relative === "index" ? "." : `./${relative.replace(/\/index$/, "")}`;
}

function matches(subpath, pattern) {
  if (!pattern.includes("*")) return subpath === pattern;
  const [prefix, suffix = ""] = pattern.split("*");
  return (
    subpath.startsWith(prefix) &&
    subpath.endsWith(suffix) &&
    subpath.length >= prefix.length + suffix.length
  );
}

const exportsMap = manifest.exports;
const blocked = Object.entries(exportsMap)
  .filter(([, target]) => target === null)
  .map(([subpath]) => subpath);
const explicit = new Set(
  Object.keys(exportsMap).filter((subpath) => !subpath.includes("*")),
);

const jsFiles = listFiles(distRoot).filter((file) => file.endsWith(".js"));
const directoryIndexes = jsFiles
  .filter((file) => path.basename(file) === "index.js")
  .map(toSubpath);

const missing = directoryIndexes.flatMap((subpath) => {
  const distAlias = subpath === "." ? "./dist" : `./dist${subpath.slice(1)}`;
  return [subpath, distAlias].filter(
    (candidate) =>
      !explicit.has(candidate) && !blocked.some((p) => matches(candidate, p)),
  );
});
if (missing.length > 0) {
  throw new Error(
    `exports is missing an entry for these directory indexes:\n  ${missing.join("\n  ")}`,
  );
}

const scopedRequire = createRequire(path.join(packageRoot, "package.json"));
const unreachable = [];
for (const subpath of [...explicit].filter(
  (subpath) => subpath !== "./package.json",
)) {
  const target = exportsMap[subpath];
  // The `dist/...` aliases carry types only: a node10 consumer's declaration
  // emit writes that form, but its JavaScript keeps the canonical specifier,
  // so there is nothing to require.
  if (target.default === undefined) {
    if (!fs.existsSync(path.join(packageRoot, target.types))) {
      unreachable.push(`${subpath}: ${target.types} is missing`);
    }
    continue;
  }
  const specifier =
    subpath === "." ? manifest.name : `${manifest.name}${subpath.slice(1)}`;
  try {
    scopedRequire.resolve(specifier);
  } catch (error) {
    unreachable.push(`${specifier}: ${error.code ?? error.message}`);
  }
}
if (unreachable.length > 0) {
  throw new Error(
    `exports entries that do not resolve:\n  ${unreachable.join("\n  ")}`,
  );
}

// The identity entry keeps the root `types` field from resolving to dist/dist,
// and it needs the directory fallback too: a consumer's declaration emit writes
// `dist/<dir>` for a directory index it resolved through this mapping.
const typesVersions = manifest.typesVersions?.["*"];
const expected = {
  "dist/*": ["dist/*", "dist/*/index.d.ts"],
  "*": ["dist/*", "dist/*/index.d.ts"],
};
if (JSON.stringify(typesVersions) !== JSON.stringify(expected)) {
  throw new Error(
    `typesVersions must be ${JSON.stringify(expected)} so node10 consumers resolve both files and directory indexes.`,
  );
}

console.log(
  `exports covers ${directoryIndexes.length} directory indexes and ${jsFiles.length} built modules.`,
);
