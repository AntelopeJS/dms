const { execFileSync } = require("node:child_process");
const { createRequire } = require("node:module");
const {
  existsSync,
  lstatSync,
  readFileSync,
  realpathSync,
  statSync,
} = require("node:fs");
const nodePath = require("node:path");
const { sep } = nodePath;
const ts = require("typescript");

const playground = nodePath.resolve(__dirname, "..");
const repository = nodePath.resolve(playground, "../../..");
const {
  vue: { parse },
  glob: { globSync },
} = require("./frontend-tools.cjs");
const {
  ANTELOPE_IGNORE_PATTERNS,
} = require("@antelopejs/tooling-configs/oxc/lint");
const { ignorePatterns } = require("../../../../oxlint.config.ts").default;

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
/** @type {string[]} */
const failures = [];
/** @type {Set<string>} */
const rawFiles = new Set();

/**
 * Repository-relative POSIX path of an absolute path.
 * @param {string} path
 * @returns {string}
 */
function repositoryPath(path) {
  return nodePath.relative(repository, path).split(sep).join("/");
}

/**
 * Text of a property name the parser can read without evaluating code.
 * @param {ts.ObjectLiteralElementLike} property
 * @returns {string | undefined}
 */
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

/**
 * Whether an ignore pattern names a `.claude/skills` link into `.agents/skills`,
 * or everything below one. The lint reads the link's files at their target, so
 * ignoring the link hides nothing.
 * @param {string} pattern
 * @returns {boolean}
 */
function isSkillLink(pattern) {
  const entry = pattern.replace(/\/\*\*$/u, "");
  if (!/^\.claude\/skills\/[^/]+$/u.test(entry)) return false;
  const path = nodePath.join(repository, entry);
  return (
    existsSync(path) &&
    lstatSync(path).isSymbolicLink() &&
    realpathSync(path).startsWith(
      nodePath.join(realpathSync(repository), ".agents/skills") + sep,
    )
  );
}

/**
 * The file Vite loads for a path written without its extension or as a directory.
 * @param {string} path
 * @returns {string | undefined}
 */
function resolveSource(path) {
  if (existsSync(path) && statSync(path).isFile()) return path;
  const candidates = [...lintedExtensions].flatMap((extension) => [
    `${path}${extension}`,
    nodePath.join(path, `index${extension}`),
  ]);
  return candidates.find((candidate) => existsSync(candidate));
}

/**
 * Whether a Vite query string requests the raw source.
 * @param {string} query
 * @returns {boolean}
 */
function isRawQuery(query) {
  return new URLSearchParams(query.replace(/^\?/u, "")).has("raw");
}

/**
 * Where Node resolves a bare specifier from a file, if anywhere.
 * @param {string} path
 * @param {string} file
 * @returns {string | undefined}
 */
function packageFile(path, file) {
  try {
    return createRequire(nodePath.join(repository, file)).resolve(path);
  } catch {
    return undefined;
  }
}

/**
 * Records the target of an import specifier that carries `?raw`.
 * @param {string} specifier
 * @param {string} file
 */
function addSpecifier(specifier, file) {
  const query = specifier.indexOf("?");
  if (query === -1 || !isRawQuery(specifier.slice(query))) return;
  const path = specifier.slice(0, query);
  if (path.startsWith("./") || path.startsWith("../")) {
    const target = resolveSource(
      nodePath.resolve(repository, nodePath.dirname(file), path),
    );
    if (target) rawFiles.add(repositoryPath(target));
    else failures.push(`${file}: "${specifier}" resolves to no file`);
    return;
  }
  if (!packageFile(path, file)?.split(sep).includes("node_modules"))
    failures.push(`${file}: import "${specifier}" by relative path`);
}

/**
 * Whether `import.meta.glob` options request raw sources.
 * @param {ts.Expression | undefined} options
 * @param {string} file
 * @returns {boolean}
 */
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

/**
 * Records every file an `import.meta.glob` call loads as raw source.
 * @param {ts.CallExpression} call
 * @param {string} file
 */
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
  const cwd = nodePath.resolve(repository, nodePath.dirname(file));
  for (const match of globSync(sources, {
    cwd,
    absolute: true,
    ignore: ["**/node_modules/**"],
  }))
    rawFiles.add(repositoryPath(match));
}

/**
 * Whether a node is the `import.meta.glob` member.
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isGlobMember(node) {
  if (!ts.isPropertyAccessExpression(node) || node.name.text !== "glob")
    return false;
  const target = ts.skipOuterExpressions(node.expression);
  return (
    ts.isMetaProperty(target) &&
    target.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}

/**
 * Records the `?raw` imports below one syntax node.
 * @param {ts.Node} node
 * @param {string} file
 */
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

/**
 * Records the `?raw` imports of one script body.
 * @param {string} source
 * @param {string} file
 * @param {ts.ScriptKind} kind
 */
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
      lintedExtensions.has(nodePath.extname(file)) &&
      existsSync(nodePath.join(repository, file)),
  );
for (const file of files) {
  const source = readFileSync(nodePath.join(repository, file), "utf8");
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
    (pattern) =>
      !defaults.has(pattern) &&
      pattern !== ESLINT_OWNED &&
      !isSkillLink(pattern),
  ),
);
/**
 * @param {string} left
 * @param {string} right
 */
const byPath = (left, right) => left.localeCompare(right);
const linted = [...rawFiles].filter((file) =>
  lintedExtensions.has(nodePath.extname(file)),
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
