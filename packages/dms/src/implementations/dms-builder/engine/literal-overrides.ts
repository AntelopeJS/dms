import { Node, type ObjectLiteralExpression } from "ts-morph";

/** Whether an object literal may hold `key` where the builder cannot read it: in a spread, or as a shorthand. */
export function hides(owner: ObjectLiteralExpression, key: string): boolean {
  return owner
    .getProperties()
    .some(
      (property) =>
        Node.isSpreadAssignment(property) ||
        (Node.isShorthandPropertyAssignment(property) &&
          property.getName() === key),
    );
}

function isStringLiteral(node: Node | undefined): boolean {
  return (
    Node.isStringLiteral(node) || Node.isNoSubstitutionTemplateLiteral(node)
  );
}

/** An object of string values under plain keys: no spread, shorthand, computed key or constant. */
function literalOverride(element: Node): boolean {
  return (
    Node.isObjectLiteralExpression(element) &&
    element
      .getProperties()
      .every(
        (property) =>
          Node.isPropertyAssignment(property) &&
          !Node.isComputedPropertyName(property.getNameNode()) &&
          isStringLiteral(property.getInitializer()),
      )
  );
}

/**
 * Whether `importOverrides` is written with literals only, so rewriting it from what the builder
 * reads keeps all of it: absent, or an array or object of string values under plain keys.
 */
export function overridesWrittenAsLiterals(
  overrides: Node | undefined,
): boolean {
  if (overrides === undefined) {
    return true;
  }
  if (Node.isArrayLiteralExpression(overrides)) {
    return overrides.getElements().every(literalOverride);
  }
  return literalOverride(overrides);
}
