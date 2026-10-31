const ts = require("typescript");

const loaderNames = new Set([
  "require",
  "createRequire",
  "eval",
  "Function",
  "System",
  "Worker",
  "URL",
  "SharedWorker",
  "importScripts",
  "_load",
  "_resolveFilename",
  "getBuiltinModule",
  "dlopen",
  "mainModule",
  "loadModule",
  "globalThis",
  "global",
  "module",
  "document",
  "window",
  "self",
  "process",
]);
/**
 * @param {ts.Node} node
 * @returns {ts.Node}
 */
function unwrap(node) {
  while (
    ts.isParenthesizedExpression(node) ||
    ts.isAsExpression(node) ||
    ts.isTypeAssertionExpression(node) ||
    ts.isNonNullExpression(node) ||
    ts.isSatisfiesExpression(node)
  ) {
    node = node.expression;
  }
  return node;
}
/**
 * @param {ts.Node} expression
 * @returns {string | number | boolean | null | undefined}
 */
function constantValue(expression) {
  const node = unwrap(expression);
  if (ts.isStringLiteralLike(node)) return node.text;
  if (ts.isNumericLiteral(node)) return Number(node.text);
  if (node.kind === ts.SyntaxKind.TrueKeyword) return true;
  if (node.kind === ts.SyntaxKind.FalseKeyword) return false;
  if (node.kind === ts.SyntaxKind.NullKeyword) return null;
  if (ts.isTemplateExpression(node)) {
    let text = node.head.text;
    for (const span of node.templateSpans) {
      const value = constantValue(span.expression);
      if (value === undefined) return undefined;
      text += String(value) + span.literal.text;
    }
    return text;
  }
  if (
    ts.isBinaryExpression(node) &&
    node.operatorToken.kind === ts.SyntaxKind.PlusToken
  ) {
    const left = constantValue(node.left);
    const right = constantValue(node.right);
    if (left !== undefined && right !== undefined) return left + right;
  }
  return undefined;
}
/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function importMeta(node) {
  return (
    ts.isMetaProperty(node) && node.keywordToken === ts.SyntaxKind.ImportKeyword
  );
}
/**
 * @param {ts.Node} node
 * @returns {string | number | boolean | null | undefined}
 */
function propertyName(node) {
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  if (ts.isElementAccessExpression(node) && node.argumentExpression)
    return constantValue(node.argumentExpression);
  return undefined;
}
/**
 * @param {ts.Node} node
 * @returns {string | undefined}
 */
function loaderReference(node) {
  if (importMeta(node)) return "import.meta";
  if (node.kind === ts.SyntaxKind.ImportKeyword) return "import";
  if (ts.isIdentifier(node) && ["module", "document"].includes(node.text)) {
    const property = [
      ts.isPropertyAccessExpression,
      ts.isPropertyAssignment,
      ts.isPropertySignature,
      ts.isPropertyDeclaration,
    ].some((matches) => matches(node.parent));
    if (property && node.parent.name === node) return undefined;
  }
  if (ts.isIdentifier(node) && loaderNames.has(node.text)) return node.text;
  const property = propertyName(node);
  if (
    (loaderNames.has(property) && !["module", "document"].includes(property)) ||
    property === "constructor" ||
    property === "import"
  )
    return `property ${property}`;
  return undefined;
}
module.exports = {
  unwrap,
  constantValue,
  importMeta,
  propertyName,
  loaderReference,
};
