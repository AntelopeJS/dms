import {
  Node,
  type ObjectLiteralElementLike,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type SourceFile,
  type SpreadAssignment,
  SyntaxKind,
} from "ts-morph";

function objectOf(node: Node | undefined): ObjectLiteralExpression | undefined {
  if (Node.isObjectLiteralExpression(node)) {
    return node;
  }
  if (Node.isCallExpression(node)) {
    return objectOf(node.getArguments()[0]);
  }
  if (
    Node.isAsExpression(node) ||
    Node.isSatisfiesExpression(node) ||
    Node.isParenthesizedExpression(node)
  ) {
    return objectOf(node.getExpression());
  }
  if (Node.isIdentifier(node)) {
    const declaration = node
      .getSourceFile()
      .getVariableDeclaration(node.getText());
    return objectOf(declaration?.getInitializer());
  }
  return undefined;
}

/**
 * The object a file default-exports, however it is spelled: a literal, a call
 * wrapping one (`defineDmsAppConfig({…})`), a cast, or a local const holding
 * any of these.
 */
export function defaultExportObject(
  sourceFile: SourceFile,
): ObjectLiteralExpression | undefined {
  const assignment = sourceFile.getExportAssignment(
    (node) => !node.isExportEquals(),
  );
  return objectOf(assignment?.getExpression());
}

/** A property of an object literal that has a name: anything but a spread. */
type NamedProperty = Exclude<ObjectLiteralElementLike, SpreadAssignment>;

/**
 * Read from the syntax alone (a quoted key unquoted), so no type checker is
 * built for a file only checked for syntax.
 */
function propertyName(property: NamedProperty): string {
  const name = property.getNameNode();
  return Node.isStringLiteral(name) ? name.getLiteralValue() : name.getText();
}

/** A `key: value` property of an object literal, quoted or not. */
export function findProperty(
  parent: ObjectLiteralExpression,
  key: string,
): PropertyAssignment | undefined {
  return parent
    .getProperties()
    .find(
      (property): property is PropertyAssignment =>
        Node.isPropertyAssignment(property) && propertyName(property) === key,
    );
}

export function objectLiteralValue(
  parent: ObjectLiteralExpression,
  key: string,
): ObjectLiteralExpression | undefined {
  const initializer = findProperty(parent, key)?.getInitializer();
  return Node.isObjectLiteralExpression(initializer) ? initializer : undefined;
}

export function stringLiteralValue(
  parent: ObjectLiteralExpression,
  key: string,
): string | undefined {
  const initializer = findProperty(parent, key)?.getInitializer();
  return Node.isStringLiteral(initializer) ||
    Node.isNoSubstitutionTemplateLiteral(initializer)
    ? initializer.getLiteralValue()
    : undefined;
}

/**
 * Whether an object literal may set `key` in a way the builder cannot read: a
 * property other than `key: value` (a shorthand, a method, an accessor), or a
 * spread, which may carry the key in from elsewhere.
 */
function hasOpaqueKey(parent: ObjectLiteralExpression, key: string): boolean {
  return parent
    .getProperties()
    .some(
      (property) =>
        Node.isSpreadAssignment(property) ||
        (!Node.isPropertyAssignment(property) &&
          propertyName(property) === key),
    );
}

/**
 * True when `key` is absent or a string literal, and the object has no spread
 * and no shorthand, method or accessor named `key`.
 */
export function canWriteString(
  parent: ObjectLiteralExpression,
  key: string,
): boolean {
  if (hasOpaqueKey(parent, key)) {
    return false;
  }
  return (
    findProperty(parent, key) === undefined ||
    stringLiteralValue(parent, key) !== undefined
  );
}

/**
 * The object literal `key` holds, to edit in place. An absent `key` is
 * created if `createIfAbsent`; otherwise the result is undefined. Null when
 * `key` is set any other way or a spread may set it: the builder does not
 * overwrite what it cannot read.
 */
export function objectToEdit(
  parent: ObjectLiteralExpression,
  key: string,
  createIfAbsent: boolean,
): ObjectLiteralExpression | undefined | null {
  const existing = objectLiteralValue(parent, key);
  if (existing) {
    return existing;
  }
  if (findProperty(parent, key) || hasOpaqueKey(parent, key)) {
    return null;
  }
  return createIfAbsent
    ? parent
        .addPropertyAssignment({ name: key, initializer: "{}" })
        .getInitializerIfKindOrThrow(SyntaxKind.ObjectLiteralExpression)
    : undefined;
}

/**
 * An unchanged value is left as written, so a save never re-quotes a line it
 * did not change.
 */
export function setStringProperty(
  parent: ObjectLiteralExpression,
  key: string,
  value: string,
): void {
  if (stringLiteralValue(parent, key) === value) {
    return;
  }
  const initializer = JSON.stringify(value);
  const existing = findProperty(parent, key);
  if (existing) {
    existing.setInitializer(initializer);
    return;
  }
  parent.addPropertyAssignment({ name: key, initializer });
}

const WHITESPACE = /\s/g;
const EMPTY_OBJECT = "{}";

/**
 * Removes `key` when it holds an empty object literal. A `parent` left with
 * only whitespace is rewritten `{}`: ts-morph keeps the line breaks around the
 * removed property.
 */
export function removeIfEmpty(
  parent: ObjectLiteralExpression,
  key: string,
): void {
  if (objectLiteralValue(parent, key)?.getProperties().length !== 0) {
    return;
  }
  findProperty(parent, key)?.remove();
  if (parent.getText().replace(WHITESPACE, "") === EMPTY_OBJECT) {
    parent.replaceWithText(EMPTY_OBJECT);
  }
}
