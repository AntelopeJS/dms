import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";

const packageRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const sourceRoot = path.join(packageRoot, "src");
/** @type {Set<string | undefined>} */
const PROXY_FACTORIES = new Set(["InterfaceFunction"]);
/** @type {Set<string | undefined>} */
const PROXY_CLASSES = new Set(["RegisteringProxy", "AsyncProxy"]);

/**
 * @param {string} directory
 * @returns {string[]}
 */
function listSources(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSources(full);
    return entry.name.endsWith(".ts") && !entry.name.endsWith(".d.ts")
      ? [full]
      : [];
  });
}

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function hasExportModifier(node) {
  return (ts.getModifiers(node) ?? []).some(
    (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
  );
}

/**
 * @param {ts.Node} expression
 * @returns {string | undefined}
 */
function identifierName(expression) {
  return ts.isIdentifier(expression) ? expression.text : undefined;
}

/**
 * Classes of the file deriving from a proxy class, however indirectly.
 * @param {ts.SourceFile} sourceFile
 * @returns {Set<string | undefined>}
 */
function collectProxyClasses(sourceFile) {
  const proxyClasses = new Set(PROXY_CLASSES);
  /** @type {{ name: string, bases: (string | undefined)[] }[]} */
  const derived = [];
  const visit = (/** @type {ts.Node} */ node) => {
    if (ts.isClassDeclaration(node) && node.name) {
      const bases = (node.heritageClauses ?? []).flatMap((clause) =>
        clause.types.map((type) => identifierName(type.expression)),
      );
      derived.push({ name: node.name.text, bases });
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  let grew = true;
  while (grew) {
    grew = false;
    for (const { name, bases } of derived) {
      if (!proxyClasses.has(name) && bases.some((b) => proxyClasses.has(b))) {
        proxyClasses.add(name);
        grew = true;
      }
    }
  }
  return proxyClasses;
}

/**
 * @param {ts.Node} node
 * @param {Set<string | undefined>} proxyClasses
 * @returns {boolean}
 */
function createsProxy(node, proxyClasses) {
  if (ts.isCallExpression(node)) {
    return PROXY_FACTORIES.has(identifierName(node.expression));
  }
  if (ts.isNewExpression(node)) {
    return proxyClasses.has(identifierName(node.expression));
  }
  return false;
}

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isWrapper(node) {
  return (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isSatisfiesExpression(node)
  );
}

/**
 * Whether the declaration chain above `node` is exported all the way up.
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isReachableFromExports(node) {
  let current = node.parent;
  while (isWrapper(current)) current = current.parent;
  if (!ts.isVariableDeclaration(current) || current.initializer === undefined) {
    return false;
  }
  const statement = current.parent.parent;
  if (!ts.isVariableStatement(statement) || !hasExportModifier(statement)) {
    return false;
  }
  for (let scope = statement.parent; !ts.isSourceFile(scope);) {
    if (!ts.isModuleBlock(scope)) return false;
    const namespace = scope.parent;
    if (!hasExportModifier(namespace)) return false;
    scope = namespace.parent;
  }
  return true;
}

/**
 * @param {string} file
 * @returns {string[]}
 */
function findUnreachableProxies(file) {
  const sourceFile = ts.createSourceFile(
    file,
    fs.readFileSync(file, "utf8"),
    ts.ScriptTarget.Latest,
    true,
  );
  const proxyClasses = collectProxyClasses(sourceFile);
  /** @type {string[]} */
  const offenders = [];
  const visit = (/** @type {ts.Node} */ node) => {
    if (createsProxy(node, proxyClasses) && !isReachableFromExports(node)) {
      const { line } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      offenders.push(`${path.relative(packageRoot, file)}:${line + 1}`);
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return offenders;
}

const sources = listSources(sourceRoot);
const offenders = sources.flatMap(findUnreachableProxies);
if (offenders.length > 0) {
  throw new Error(
    "proxies ImplementInterface cannot reach (export them, at the top level " +
      `or in an exported namespace):\n  ${offenders.join("\n  ")}`,
  );
}

console.log(`every proxy in ${sources.length} source files is exported.`);
