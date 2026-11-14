import { Node, type ObjectLiteralExpression, SyntaxKind } from "ts-morph";
import { hides, isPlainObjectLiteral } from "./literal-overrides";
import { propertyNamed } from "./modules";

/** The kinds of value an object may replace without losing a part of it: a scalar or an array literal. */
const REPLACEABLE_KINDS: ReadonlySet<SyntaxKind> = new Set([
  SyntaxKind.ArrayLiteralExpression,
  SyntaxKind.StringLiteral,
  SyntaxKind.NoSubstitutionTemplateLiteral,
  SyntaxKind.NumericLiteral,
  SyntaxKind.TrueKeyword,
  SyntaxKind.FalseKeyword,
  SyntaxKind.NullKeyword,
]);

function isReplaceable(node: Node): boolean {
  return Node.isPrefixUnaryExpression(node)
    ? Node.isNumericLiteral(node.getOperand())
    : REPLACEABLE_KINDS.has(node.getKind());
}

/**
 * What an object value meets at `key` of `owner`: nothing, a scalar or an array, which it
 * replaces; an object literal with no spread, which it joins key by key; or anything the builder
 * cannot read key by key, a spread, a shorthand, a variable or a call, which it cannot replace
 * without losing what that holds.
 */
export function heldAt(
  owner: ObjectLiteralExpression | undefined,
  key: string,
): "replace" | "merge" | "unreadable" {
  if (!owner) {
    return "replace";
  }
  if (hides(owner, key)) {
    return "unreadable";
  }
  const existing = propertyNamed(owner, key);
  if (existing === undefined) {
    return "replace";
  }
  if (Node.isObjectLiteralExpression(existing)) {
    return isPlainObjectLiteral(existing) ? "merge" : "unreadable";
  }
  return isReplaceable(existing) ? "replace" : "unreadable";
}
