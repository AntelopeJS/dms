import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const FRONTEND_SOURCE_DIR = "frontend-vue";
const DECLARATION_FIELD = "dmsFrontend";
const EXPORTS_FRONTEND_MODULE =
  /export\s+(?:async\s+)?(?:function|const)\s+frontendModule\b/;
const SKIPPED_DIRECTORIES = new Set(["node_modules", FRONTEND_SOURCE_DIR]);

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

function readManifest(directory) {
  const file = path.join(directory, "package.json");
  return fs.existsSync(file)
    ? JSON.parse(fs.readFileSync(file, "utf8"))
    : undefined;
}

/** This package and the packages directly under it, such as the playground. */
function packageDirectories() {
  const children = fs
    .readdirSync(packageRoot, { withFileTypes: true })
    .filter(
      (entry) => entry.isDirectory() && !SKIPPED_DIRECTORIES.has(entry.name),
    )
    .map((entry) => path.join(packageRoot, entry.name));
  return [packageRoot, ...children].filter((directory) =>
    readManifest(directory),
  );
}

/** The TypeScript source a `dist/<file>.js` declaration is compiled from. */
function sourceOf(declaration) {
  return declaration.replace(/^dist\//, "src/").replace(/\.js$/, ".ts");
}

/**
 * `ajs dms dev`, `build` and `start` read a project, not the backend's
 * `AddFrontendModule` registrations: they take a module's frontend from the
 * file its package.json names as `dmsFrontend`, and leave out, with a mere
 * warning, a package that ships `frontend-vue/` without one. This lists the
 * packages that ship `frontend-vue/` and declare no file exporting
 * `frontendModule`.
 */
function problemsOf(directory) {
  if (!fs.existsSync(path.join(directory, FRONTEND_SOURCE_DIR))) return [];
  const name = path.relative(packageRoot, directory) || ".";
  const declaration = readManifest(directory)[DECLARATION_FIELD];
  if (!declaration) {
    return [
      `${name} ships ${FRONTEND_SOURCE_DIR}/ but its package.json declares no ${DECLARATION_FIELD}: ajs dms dev, build and start leave its pages' components out`,
    ];
  }
  const source = path.join(directory, sourceOf(declaration));
  if (!fs.existsSync(source)) {
    return [
      `${name} declares ${DECLARATION_FIELD} ${declaration}, compiled from ${path.relative(directory, source)}, which does not exist`,
    ];
  }
  if (!EXPORTS_FRONTEND_MODULE.test(fs.readFileSync(source, "utf8"))) {
    return [
      `${name}: ${path.relative(directory, source)} exports no frontendModule function`,
    ];
  }
  return [];
}

const directories = packageDirectories();
const problems = directories.flatMap(problemsOf);
if (problems.length > 0) {
  for (const problem of problems) console.error(problem);
  process.exit(1);
}
console.log(
  `Every package shipping ${FRONTEND_SOURCE_DIR}/ declares ${DECLARATION_FIELD} (${directories.length} packages checked).`,
);
