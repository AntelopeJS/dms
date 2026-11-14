import {
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type ShorthandPropertyAssignment,
} from "ts-morph";

/** Whether a member's name is not one the builder reads: a spread, a computed name, a method or an accessor. */
function hidesItsName(member: ObjectLiteralElementLike): boolean {
  return Node.isPropertyAssignment(member)
    ? Node.isComputedPropertyName(member.getNameNode())
    : !Node.isShorthandPropertyAssignment(member);
}

/** Whether an object literal has a member whose name the builder cannot read, which may be any key. */
export function hasUnreadableMember(owner: ObjectLiteralExpression): boolean {
  return owner.getProperties().some(hidesItsName);
}

/**
 * The members of an object literal written after its last member with an unreadable name. A later
 * key wins over an earlier one, so these alone decide what the object holds for the keys they name.
 */
export function readableTail(
  owner: ObjectLiteralExpression,
): ObjectLiteralElementLike[] {
  const members = owner.getProperties();
  return members.slice(members.findLastIndex(hidesItsName) + 1);
}

/** Whether `node` is an object literal whose every member the builder reads by its name, as written. */
export function isPlainObjectLiteral(
  node: Node | undefined,
): node is ObjectLiteralExpression {
  return Node.isObjectLiteralExpression(node) && !hasUnreadableMember(node);
}

/** The shorthand member of `owner` named `key`, whose value is a variable the builder cannot read. */
export function shorthandNamed(
  owner: ObjectLiteralExpression,
  key: string,
): ShorthandPropertyAssignment | undefined {
  return owner
    .getProperties()
    .filter(Node.isShorthandPropertyAssignment)
    .find((property) => property.getName() === key);
}

/** Whether an object literal may hold `key` where the builder cannot read it: under an unreadable name, or as a shorthand. */
export function hides(owner: ObjectLiteralExpression, key: string): boolean {
  return hasUnreadableMember(owner) || shorthandNamed(owner, key) !== undefined;
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
