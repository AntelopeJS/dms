import {
  type CallExpression,
  type ClassDeclaration,
  type Identifier,
  Node,
  type ObjectLiteralExpression,
} from "ts-morph";

export function stringLiteralValue(node: Node | undefined): string | undefined {
  if (!node) {
    return undefined;
  }
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return node.getLiteralValue();
  }
  return undefined;
}

export function getObjectProperty(
  obj: ObjectLiteralExpression,
  name: string,
): Node | undefined {
  const prop = obj.getProperty(name);
  if (!prop || !Node.isPropertyAssignment(prop)) {
    return undefined;
  }
  return prop.getInitializer();
}

export function getStringProperty(
  obj: ObjectLiteralExpression,
  name: string,
): string | undefined {
  return stringLiteralValue(getObjectProperty(obj, name));
}

export function getNumberProperty(
  obj: ObjectLiteralExpression,
  name: string,
): number | undefined {
  const init = getObjectProperty(obj, name);
  if (init && Node.isNumericLiteral(init)) {
    return init.getLiteralValue();
  }
  return undefined;
}

export function getBooleanProperty(
  obj: ObjectLiteralExpression,
  name: string,
): boolean | undefined {
  const init = getObjectProperty(obj, name);
  if (!init) {
    return undefined;
  }
  if (Node.isTrueLiteral(init)) {
    return true;
  }
  if (Node.isFalseLiteral(init)) {
    return false;
  }
  return undefined;
}

export function getIdentifierProperty(
  obj: ObjectLiteralExpression,
  name: string,
): Identifier | undefined {
  const init = getObjectProperty(obj, name);
  return init && Node.isIdentifier(init) ? init : undefined;
}

export function getCalleeName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return Node.isIdentifier(expr) ? expr.getText() : undefined;
}

export function getExtendsCall(
  cls: ClassDeclaration,
): CallExpression | undefined {
  const ext = cls.getExtends();
  if (!ext) {
    return undefined;
  }
  const expr = ext.getExpression();
  return Node.isCallExpression(expr) ? expr : undefined;
}
