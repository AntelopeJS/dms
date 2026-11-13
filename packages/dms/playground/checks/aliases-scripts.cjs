const ts = require("typescript");
const {
  unwrap,
  constantValue,
  importMeta,
  propertyName,
  loaderReference,
} = require("./syntax.cjs");
const { failures } = require("./aliases-context.cjs");
const { checkSpecifier, checkGlob } = require("./aliases-specifiers.cjs");

const globalMethods = new Map([
  ["window", new Set(["addEventListener", "removeEventListener"])],
  ["process", new Set(["uptime"])],
]);

/**
 * @param {ts.CallExpression} node
 * @param {string} path
 * @param {WeakSet<ts.Node>} allowed
 */
function checkCall(node, path, allowed) {
  const callee = unwrap(node.expression);
  if (
    (ts.isPropertyAccessExpression(callee) ||
      ts.isElementAccessExpression(callee)) &&
    importMeta(unwrap(callee.expression)) &&
    propertyName(callee) === "glob"
  ) {
    allowed.add(unwrap(callee.expression));
    if (!checkGlob(node, path))
      failures.push(`${path}: unsupported playground glob`);
  } else if (
    ts.isIdentifier(node.expression) &&
    node.expression.text === "require" &&
    !node.questionDotToken &&
    node.arguments.length === 1
  ) {
    allowed.add(node.expression);
    checkSpecifier(constantValue(node.arguments[0]), path, false);
  } else if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
    allowed.add(node.expression);
    checkSpecifier(
      node.arguments[0] ? constantValue(node.arguments[0]) : undefined,
      path,
    );
  } else if (
    ts.isPropertyAccessExpression(callee) &&
    ts.isIdentifier(callee.expression) &&
    globalMethods.get(callee.expression.text)?.has(callee.name.text)
  ) {
    allowed.add(callee.expression);
  }
}

/**
 * @param {string} text
 * @param {string} path
 * @param {ts.ScriptKind} [kind]
 */
function checkScript(text, path, kind = ts.getScriptKindFromFileName(path)) {
  const source = ts.createSourceFile(
    path,
    text,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  if (source.parseDiagnostics.length) {
    for (const diagnostic of source.parseDiagnostics)
      failures.push(
        `${path}: invalid playground script: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, " ")}`,
      );
    return;
  }
  const allowed = new WeakSet();
  /** @param {ts.Node} node */
  function visit(node) {
    if (ts.isCallExpression(node)) checkCall(node, path, allowed);
    if (
      (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) &&
      node.moduleSpecifier
    ) {
      checkSpecifier(constantValue(node.moduleSpecifier), path);
    } else if (ts.isExternalModuleReference(node) && node.expression) {
      checkSpecifier(constantValue(node.expression), path, false);
    } else if (
      ts.isImportTypeNode(node) &&
      ts.isLiteralTypeNode(node.argument)
    ) {
      checkSpecifier(constantValue(node.argument.literal), path);
    }
    const unsupported = !allowed.has(node) && loaderReference(node);
    if (unsupported)
      failures.push(`${path}: unsupported playground loader ${unsupported}`);
    ts.forEachChild(node, visit);
  }
  visit(source);
}

module.exports = { checkScript };
