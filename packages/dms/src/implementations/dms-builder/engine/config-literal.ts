import {
  Node,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
  SyntaxKind,
  VariableDeclarationKind,
} from "ts-morph";
import { buildCatalog } from "./catalog";
import { importedName, unwrapExpression } from "./expression";
import { type LiteralObject, type LiteralValue } from "./guards";
import { findResourceBySymbol } from "./resource-index";

export interface LiteralResult {
  value: LiteralValue;
  fullyLiteral: boolean;
  /**
   * The named constants the value was read from, each with where it sits in
   * it: a writer puts a name back at that place, never wherever the same value
   * happens to turn up.
   */
  constants?: NamedConstant[];
}

/** The result of reading an object literal: always an object, opaque or not. */
export interface ObjectLiteralResult extends LiteralResult {
  value: LiteralObject;
}

/** A value a `const` can hold that the writer can put back as its name. */
type ConstantValue = string | number | boolean | null;

function isConstantValue(value: LiteralValue): value is ConstantValue {
  return (
    value === null ||
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  );
}

/** A named constant a value was read from. */
export interface NamedConstant {
  /** The keys and indexes leading to it from the top of the value read. */
  path: (string | number)[];
  name: string;
  value: ConstantValue;
}

/** The constants of a value read inside another, placed within that other. */
function nestedConstants(
  inner: LiteralResult | undefined,
  ...keys: (string | number)[]
): NamedConstant[] {
  return (inner?.constants ?? []).map((constant) => ({
    ...constant,
    path: [...keys, ...constant.path],
  }));
}

function opaqueExpr(node: Node): ObjectLiteralResult {
  return { value: { $expr: node.getText() }, fullyLiteral: false };
}

function isLocallyDeclared(callee: Node): boolean {
  if (!Node.isIdentifier(callee)) {
    return false;
  }
  return callee
    .getDefinitionNodes()
    .some(
      (definition) =>
        definition.getSourceFile() === callee.getSourceFile() &&
        !Node.isImportSpecifier(definition) &&
        !Node.isImportClause(definition),
    );
}

/**
 * A DataType instantiation inside a config value — a Form field's `type`. Read
 * back as a `$dataType` sentinel so the value stays editable and re-emittable
 * rather than falling through to an opaque expression. The emitter writes a
 * DataType back as `new X(config)` and nothing else, so a call with a second
 * argument is not read: it falls through to an opaque expression, which keeps
 * the argument that would otherwise be dropped on the next write.
 */
function dataTypeCall(node: Node): LiteralResult | undefined {
  if (!Node.isNewExpression(node)) {
    return undefined;
  }
  const callee = importedName(
    node.getExpression(),
    buildCatalog().dataTypes.map((entry) => entry.import),
  );
  const descriptor = buildCatalog().dataTypes.find(
    (candidate) => candidate.import.name === callee,
  );
  if (!descriptor) {
    return undefined;
  }
  const args = node.getArguments();
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0] && unwrapExpression(args[0]);
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  const value: LiteralObject = { $dataType: descriptor.id };
  if (config && Object.keys(config.value).length > 0) {
    value.config = config.value;
  }
  return {
    value,
    fullyLiteral: config ? config.fullyLiteral : true,
    constants: nestedConstants(config, "config"),
  };
}

/**
 * A nested factory call inside a config value — a ChartCard's `chart`. Read back
 * as a `$block` sentinel so the value stays editable rather than opaque.
 */
function blockCall(node: Node): LiteralResult | undefined {
  if (!Node.isCallExpression(node)) {
    return undefined;
  }
  const callee = node.getExpression();
  const name = importedName(
    callee,
    buildCatalog().blocks.map((entry) => entry.import),
  );
  if (!name) {
    return undefined;
  }
  const args = node.getArguments();
  if (args.length > 1) {
    return undefined;
  }
  const arg = args[0] && unwrapExpression(args[0]);
  if (arg && !Node.isObjectLiteralExpression(arg)) {
    return undefined;
  }
  const config = arg ? objectLiteralToValue(arg) : undefined;
  return {
    value: {
      $block: {
        type: name,
        config: config?.value ?? {},
      },
    },
    fullyLiteral: config ? config.fullyLiteral : true,
    constants: nestedConstants(config, "$block", "config"),
  };
}

/**
 * A table's DataAPI class inside a config value — a relation field's
 * `dataApiController`. Read back as the `$ref` the builder writes it from, so
 * the table stays chosen in the panel rather than the whole block turning
 * opaque on its first save.
 */
function resourceRef(node: Node): LiteralResult | undefined {
  if (!Node.isIdentifier(node) || isLocallyDeclared(node)) {
    return undefined;
  }
  const found = findResourceBySymbol(node.getText());
  if (found?.as !== "dataApi") {
    return undefined;
  }
  return { value: { $ref: { resource: found.ref } }, fullyLiteral: true };
}

/**
 * The value of a `const` declared in the same file with a plain value —
 * `id: PERIOD_SCOPE` — or `undefined` for anything else.
 *
 * Only a plain value: an object held in a constant is one instance shared by
 * every reader, and writing it back as a copy would quietly split it. And only
 * the same file, so the name the writer puts back never depends on an import it
 * does not manage.
 */
const readingConstants = new Set<Node>();

function constantValue(node: Node): { value: ConstantValue } | undefined {
  if (!Node.isIdentifier(node)) {
    return undefined;
  }
  const parent = node.getParent();
  const definitions =
    parent && Node.isShorthandPropertyAssignment(parent)
      ? (node
          .getProject()
          .getTypeChecker()
          .getShorthandAssignmentValueSymbol(parent)
          ?.getDeclarations() ?? [])
      : node.getDefinitionNodes();
  const definition = definitions[0];
  if (
    definitions.length !== 1 ||
    !definition ||
    !Node.isVariableDeclaration(definition) ||
    definition.getSourceFile() !== node.getSourceFile() ||
    definition.getVariableStatement()?.getDeclarationKind() !==
      VariableDeclarationKind.Const
  ) {
    return undefined;
  }
  if (readingConstants.has(definition)) return undefined;
  readingConstants.add(definition);
  let initializer: LiteralResult;
  try {
    initializer = literalToValue(definition.getInitializer());
  } finally {
    readingConstants.delete(definition);
  }
  const { value } = initializer;
  if (!initializer.fullyLiteral || !isConstantValue(value)) {
    return undefined;
  }
  return { value };
}

/**
 * A constant inside a config value, read as the value it holds, so one named
 * string does not lock the whole block. It is reported with its name, and the
 * page writer puts that back where it stood while the value there is unchanged.
 */
function constantRef(node: Node): LiteralResult | undefined {
  const constant = constantValue(node);
  if (!constant) {
    return undefined;
  }
  const { value } = constant;
  return {
    value,
    fullyLiteral: true,
    constants: [{ path: [], name: node.getText(), value }],
  };
}

export function propertyName(
  prop: PropertyAssignment | ShorthandPropertyAssignment,
): string {
  const nameNode = prop.getNameNode();
  if (
    Node.isStringLiteral(nameNode) ||
    Node.isNoSubstitutionTemplateLiteral(nameNode)
  ) {
    return nameNode.getLiteralValue();
  }
  return prop.getName();
}

function literalToValue(node: Node | undefined): LiteralResult {
  if (!node) {
    return { value: undefined, fullyLiteral: true };
  }
  node = unwrapExpression(node);
  if (
    Node.isStringLiteral(node) ||
    Node.isNoSubstitutionTemplateLiteral(node)
  ) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isNumericLiteral(node)) {
    return { value: node.getLiteralValue(), fullyLiteral: true };
  }
  if (Node.isPrefixUnaryExpression(node)) {
    const operand = node.getOperand();
    const token = node.getOperatorToken();
    if (
      Node.isNumericLiteral(operand) &&
      (token === SyntaxKind.MinusToken || token === SyntaxKind.PlusToken)
    ) {
      const magnitude = operand.getLiteralValue();
      return {
        value: token === SyntaxKind.MinusToken ? -magnitude : magnitude,
        fullyLiteral: true,
      };
    }
  }
  if (Node.isTrueLiteral(node)) {
    return { value: true, fullyLiteral: true };
  }
  if (Node.isFalseLiteral(node)) {
    return { value: false, fullyLiteral: true };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { value: null, fullyLiteral: true };
  }
  if (Node.isObjectLiteralExpression(node)) {
    return objectLiteralToValue(node);
  }
  if (Node.isArrayLiteralExpression(node)) {
    return arrayLiteralToValue(node);
  }
  return (
    dataTypeCall(node) ??
    blockCall(node) ??
    resourceRef(node) ??
    constantRef(node) ??
    opaqueExpr(node)
  );
}

export function objectLiteralToValue(node: Node): ObjectLiteralResult {
  node = unwrapExpression(node);
  if (!Node.isObjectLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const result: LiteralObject = {};
  const constants: NamedConstant[] = [];
  let fullyLiteral = true;
  for (const prop of node.getProperties()) {
    if (
      (!Node.isPropertyAssignment(prop) &&
        !Node.isShorthandPropertyAssignment(prop)) ||
      Node.isComputedPropertyName(prop.getNameNode())
    ) {
      fullyLiteral = false;
      continue;
    }
    const key = propertyName(prop);
    if (key === "__proto__" || Object.hasOwn(result, key))
      return opaqueExpr(node);
    const child = literalToValue(
      Node.isShorthandPropertyAssignment(prop)
        ? prop.getNameNode()
        : prop.getInitializer(),
    );
    result[key] = child.value;
    constants.push(...nestedConstants(child, key));
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: result, fullyLiteral, constants };
}

/** What a block's options object lets the builder edit, and what it locks. */
export interface EditableOptions {
  config: LiteralObject;
  lockedOptions: Record<string, string>;
  reason?: string;
}

/** Top-level options are the edit boundary; nested code locks its whole option. */
export function editableOptions(node: Node | undefined): EditableOptions {
  const config: LiteralObject = {};
  const lockedOptions: Record<string, string> = {};
  if (!node) return { config, lockedOptions };
  node = unwrapExpression(node);
  if (!Node.isObjectLiteralExpression(node)) {
    return {
      config,
      lockedOptions,
      reason: "Computed or shared configuration: edit it in code",
    };
  }
  const names = new Set<string>();
  for (const prop of node.getProperties()) {
    if (
      (!Node.isPropertyAssignment(prop) &&
        !Node.isShorthandPropertyAssignment(prop)) ||
      Node.isComputedPropertyName(prop.getNameNode())
    ) {
      return {
        config: {},
        lockedOptions: {},
        reason:
          "Spreads, methods or computed keys can affect other options: edit this configuration in code",
      };
    }
    const key = propertyName(prop);
    if (names.has(key) || key === "__proto__") {
      return {
        config: {},
        lockedOptions: {},
        reason: "Duplicate or prototype keys require editing in code",
      };
    }
    names.add(key);
    const read = literalToValue(
      Node.isShorthandPropertyAssignment(prop)
        ? prop.getNameNode()
        : prop.getInitializer(),
    );
    if (read.fullyLiteral) config[key] = read.value;
    else
      lockedOptions[key] =
        "Defined by an expression in code; preserved unchanged on save";
  }
  return { config, lockedOptions };
}

function arrayLiteralToValue(node: Node): LiteralResult {
  if (!Node.isArrayLiteralExpression(node)) {
    return opaqueExpr(node);
  }
  const items: LiteralValue[] = [];
  const constants: NamedConstant[] = [];
  let fullyLiteral = true;
  for (const [index, element] of node.getElements().entries()) {
    const child = literalToValue(element);
    items.push(child.value);
    constants.push(...nestedConstants(child, index));
    fullyLiteral = fullyLiteral && child.fullyLiteral;
  }
  return { value: items, fullyLiteral, constants };
}
