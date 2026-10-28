const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync, statSync } = require("node:fs");
const { createRequire } = require("node:module");
const { dirname, extname, join, relative, resolve, sep } = require("node:path");
const ts = require("typescript");

const playground = resolve(__dirname, "..");
const repository = resolve(playground, "../../..");
const frontendRequire = createRequire(
  join(playground, "../frontend-vue/package.json"),
);
const { parse } = frontendRequire("vue/compiler-sfc");
const { globSync } = createRequire(
  frontendRequire.resolve("vite/package.json"),
)("tinyglobby");
const { ANTELOPE_IGNORE_PATTERNS } = createRequire(
  join(repository, "package.json"),
)("@antelopejs/tooling-configs/oxc/lint");
const { ignorePatterns } = require(
  join(repository, "oxlint.config.ts"),
).default;

/** The directory oxlint leaves to the Vue layer's own ESLint config. */
const ESLINT_OWNED = "packages/dms/frontend-vue/**";
const scriptExtensions = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);
const lintedExtensions = new Set([...scriptExtensions, ".vue"]);
const failures = [];
const rawFiles = new Set();

/** Repository-relative POSIX path of an absolute path. */
function repositoryPath(path) {
  return relative(repository, path).split(sep).join("/");
}

/** Text of a property name the parser can read without evaluating code. */
function propertyName(property) {
  const name = property.name;
  if (name && ts.isComputedPropertyName(name))
    return ts.isStringLiteralLike(name.expression)
      ? name.expression.text
      : undefined;
  return name && (ts.isIdentifier(name) || ts.isStringLiteralLike(name))
    ? name.text
    : undefined;
}

/** The file Vite loads for a path written without its extension or as a directory. */
function resolveSource(path) {
  if (existsSync(path) && statSync(path).isFile()) return path;
  const candidates = [...lintedExtensions].flatMap((extension) => [
    `${path}${extension}`,
    join(path, `index${extension}`),
  ]);
  return candidates.find((candidate) => existsSync(candidate));
}

/** Whether a Vite query string requests the raw source. */
function isRawQuery(query) {
  return new URLSearchParams(query.replace(/^\?/u, "")).has("raw");
}

/** Where Node resolves a bare specifier from a file, if anywhere. */
function packageFile(path, file) {
  try {
    return createRequire(join(repository, file)).resolve(path);
  } catch {
    return undefined;
  }
}

/** Records the target of an import specifier that carries `?raw`. */
function addSpecifier(specifier, file) {
  const query = specifier.indexOf("?");
  if (query === -1 || !isRawQuery(specifier.slice(query))) return;
  const path = specifier.slice(0, query);
  if (path.startsWith("./") || path.startsWith("../")) {
    const target = resolveSource(resolve(repository, dirname(file), path));
    if (target) rawFiles.add(repositoryPath(target));
    else failures.push(`${file}: "${specifier}" resolves to no file`);
    return;
  }
  if (!packageFile(path, file)?.split(sep).includes("node_modules"))
    failures.push(`${file}: import "${specifier}" by relative path`);
}

/** Whether `import.meta.glob` options request raw sources. */
function isRawGlob(options, file) {
  if (options === undefined) return false;
  if (!ts.isObjectLiteralExpression(options)) {
    failures.push(`${file}: write import.meta.glob options as a literal`);
    return false;
  }
  return options.properties.some((property) => {
    const name = propertyName(property);
    const assigned = ts.isPropertyAssignment(property);
    if (
      name === undefined ||
      (!assigned && (name === "as" || name === "query"))
    ) {
      failures.push(`${file}: write import.meta.glob options as a literal`);
      return false;
    }
    if (!assigned) return false;
    const value = property.initializer;
    if (name === "as")
      return ts.isStringLiteralLike(value) && value.text === "raw";
    if (name !== "query") return false;
    if (ts.isStringLiteralLike(value)) return isRawQuery(value.text);
    if (ts.isObjectLiteralExpression(value))
      return value.properties.some((entry) => propertyName(entry) === "raw");
    failures.push(`${file}: write the import.meta.glob query as a literal`);
    return false;
  });
}

/** Records every file an `import.meta.glob` call loads as raw source. */
function addGlob(call, file) {
  const [patterns, options] = call.arguments;
  if (!isRawGlob(options, file)) return;
  const elements =
    patterns && ts.isArrayLiteralExpression(patterns)
      ? patterns.elements
      : [patterns];
  const sources = elements.flatMap((element) =>
    element && ts.isStringLiteralLike(element) ? [element.text] : [],
  );
  if (
    sources.length !== elements.length ||
    sources.some((pattern) => !/^!?\.\.?\//u.test(pattern))
  ) {
    failures.push(`${file}: write ?raw glob patterns as relative literals`);
    return;
  }
  const cwd = resolve(repository, dirname(file));
  for (const match of globSync(sources, {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**"],
  }))
    rawFiles.add(repositoryPath(match));
}

/** Whether a node is the `import.meta.glob` member. */
function isGlobMember(node) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "glob")
    return false;
  const target = ts.skipOuterExpressions(node.expression);
  return (
    ts.isMetaProperty(target) &&
    target.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

/** Records the `?raw` imports below one syntax node. */
function visit(node, file) {
  if (
    (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
    node.moduleSpecifier &&
    ts.isStringLiteralLike(node.moduleSpecifier)
  ) {
    addSpecifier(node.moduleSpecifier.text, file);
  } else if (ts.isCallExpression(node) && isGlobMember(node.expression)) {
    addGlob(node, file);
  } else if (
    ts.isCallExpression(node) &&
    node.expression.kind === ts.SyntaxKind.ImportKeyword
  ) {
    const [specifier] = node.arguments;
    if (specifier && ts.isStringLiteralLike(specifier))
      addSpecifier(specifier.text, file);
    else if (specifier?.getText().includes("?raw"))
      failures.push(`${file}: write the ?raw import as a literal path`);
  }
  ts.forEachChild(node, (child) => visit(child, file));
}

/** Records the `?raw` imports of one script body. */
function scan(source, file, kind) {
  visit(
    ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind),
    file,
  );
}

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: repository, encoding: "utf8" },
)
  .split("\0")
  .filter(
    (file) =>
      lintedExtensions.has(extname(file)) && existsSync(join(repository, file)),
  );
for (const file of files) {
  const source = readFileSync(join(repository, file), "utf8");
  if (!source.includes("raw")) continue;
  if (!file.endsWith(".vue")) {
    scan(
      source,
      file,
      file.endsWith("x") ? ts.ScriptKind.TSX : ts.ScriptKind.TS,
    );
    continue;
  }
  const { descriptor } = parse(source, { filename: file });
  for (const block of [descriptor.script, descriptor.scriptSetup])
    if (block) scan(block.content, file, ts.ScriptKind.TS);
}

const defaults = new Set(ANTELOPE_IGNORE_PATTERNS);
const listed = new Set(
  ignorePatterns.filter(
    (pattern) => !defaults.has(pattern) && pattern !== ESLINT_OWNED,
  ),
);
const byPath = (left, right) => left.localeCompare(right);
const linted = [...rawFiles].filter((file) =>
  lintedExtensions.has(extname(file)),
);
for (const file of linted.sort(byPath))
  if (!listed.has(file))
    failures.push(
      `${file}: imported with ?raw, so list it in ignorePatterns in oxlint.config.ts`,
    );
for (const pattern of [...listed].sort(byPath))
  if (!rawFiles.has(pattern))
    failures.push(
      `${pattern}: oxlint.config.ts ignores it, but nothing imports it with ?raw; lint it instead`,
    );
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
