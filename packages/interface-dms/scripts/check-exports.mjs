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

const missing = directoryIndexes.filter(
  (subpath) =>
    !explicit.has(subpath) && !blocked.some((p) => matches(subpath, p)),
);
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

console.log(
  `exports covers ${directoryIndexes.length} directory indexes and ${jsFiles.length} built modules.`,
);
