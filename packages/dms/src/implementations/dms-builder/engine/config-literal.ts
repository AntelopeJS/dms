import {
  Node,
  type ObjectLiteralExpression,
  type PropertyAssignment,
  type ShorthandPropertyAssignment,
  type SourceFile,
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

/** A value the writer can put back as its source text. */
interface ValueName {
  /** The source text: a constant's name, an enum member, or a template literal of constants. */
  name: string;
  value: ConstantValue;
}

/** A named constant a value was read from. */
export interface NamedConstant extends ValueName {
  /** The keys and indexes leading to it from the top of the value read. */
  path: (string | number)[];
  /**
   * Every member of the enum the value was read from, so an edited value one
   * of them holds is written as that member rather than as a literal.
   */
  members?: ValueName[];
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
 * The value of a `const` declared with a plain value, in the same file or
 * imported — `id: PERIOD_SCOPE` — or `undefined` for anything else.
 *
 * Only a plain value: an object held in a constant is one instance shared by
 * every reader, and writing it back as a copy would quietly split it. Only a
 * named import from another file: the writer prunes a named import once an
 * edit replaces the name with a value, and leaves a default import behind.
 */
const readingConstants = new Set<Node>();

function importedByName(node: Node): boolean {
  return (
    node.getSymbol()?.getDeclarations().some(Node.isImportSpecifier) ?? false
  );
}

/**
 * The value of each constant a file imports by name, and of each member of an
 * enum it declares, so a page's version moves when one of them changes in
 * another file: an enum member's value can be read through any import.
 */
export function importedConstants(
  sourceFile: SourceFile,
): [string, ConstantValue][] {
  const localEnums = sourceFile
    .getDescendantsOfKind(SyntaxKind.EnumDeclaration)
    .flatMap((declaration) =>
      declaration
        .getMembers()
        .map((member): [string, ConstantValue] => [
          `${declaration.getName()}.${member.getName()}`,
          member.getValue() ?? null,
        ]),
    );
  const imported = sourceFile
    .getImportDeclarations()
    .flatMap((declaration) => declaration.getNamedImports())
    .flatMap((specifier): [string, ConstantValue][] => {
      const binding = specifier.getAliasNode() ?? specifier.getNameNode();
      if (!Node.isIdentifier(binding)) return [];
      const constant = constantValue(binding);
      if (constant) return [[binding.getText(), constant.value]];
      return (enumMembers(binding) ?? []).map(
        ({ name, value }): [string, ConstantValue] => [name, value],
      );
    });
  return [...imported, ...localEnums];
}

/** Whether a member's value reaches the builder unchanged through JSON: not `NaN` or an infinity. */
function survivesJson(
  value: string | number | undefined,
): value is string | number {
  return value !== undefined && JSON.stringify(value) !== "null";
}

/**
 * Each member of the enum `owner` names whose value the checker resolves,
 * written as `owner.member`, or `undefined` when `owner` is not an enum
 * declared in the same file or imported by name.
 */
function enumMembers(owner: Node): ValueName[] | undefined {
  if (!Node.isIdentifier(owner)) {
    return undefined;
  }
  const definitions = owner.getDefinitionNodes();
  const definition = definitions[0];
  if (
    definitions.length !== 1 ||
    !Node.isEnumDeclaration(definition) ||
    (definition.getSourceFile() !== owner.getSourceFile() &&
      !importedByName(owner))
  ) {
    return undefined;
  }
  return definition.getMembers().flatMap((member) => {
    const value = member.getValue();
    return survivesJson(value) && Node.isIdentifier(member.getNameNode())
      ? [{ name: `${owner.getText()}.${member.getName()}`, value }]
      : [];
  });
}

/**
 * A member of an enum the checker resolves, `HttpMethod.get`, read as its
 * value, so an option set from an enum does not lock its block. It is reported
 * with its name and the enum's other members, and the page writer puts back
 * the member that holds the value saved, or a literal when none does.
 */
function enumMemberRef(node: Node): LiteralResult | undefined {
  if (!Node.isPropertyAccessExpression(node)) {
    return undefined;
  }
  const owner = node.getExpression();
  const members = enumMembers(owner);
  const name = `${owner.getText()}.${node.getName()}`;
  const member = members?.find((candidate) => candidate.name === name);
  if (!members || !member) {
    return undefined;
  }
  return {
    value: member.value,
    fullyLiteral: true,
    constants: [{ path: [], ...member, members }],
  };
}

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
    (definition.getSourceFile() !== node.getSourceFile() &&
      !importedByName(node)) ||
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

/**
 * A template literal whose every substitution is a plain constant —
 * `` `${API}/users` `` — read as the string it builds, so a route built from a
 * base URL does not lock its block. It is reported with its source text, and
 * the page writer puts the template back while the string is unchanged.
 */
function templateRef(node: Node): LiteralResult | undefined {
  if (!Node.isTemplateExpression(node)) {
    return undefined;
  }
  let value = node.getHead().getLiteralText();
  for (const span of node.getTemplateSpans()) {
    const part = constantValue(unwrapExpression(span.getExpression()));
    if (!part) {
      return undefined;
    }
    value += String(part.value) + span.getLiteral().getLiteralText();
  }
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
  return codeValue(node);
}

/** The readers of a value written as code rather than a literal, tried in order. */
const CODE_READERS = [
  dataTypeCall,
  blockCall,
  resourceRef,
  constantRef,
  enumMemberRef,
  templateRef,
];

/** The value code stands for, when a reader resolves it; otherwise the code, opaque. */
function codeValue(node: Node): LiteralResult {
  for (const read of CODE_READERS) {
    const result = read(node);
    if (result) return result;
  }
  return opaqueExpr(node);
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

/**
 * A top-level option of an object literal read as the data it holds: literals,
 * `const`s holding them, shorthand included, and templates of such constants.
 * An option written as other code reads back as absent.
 */
export function optionValue(
  obj: ObjectLiteralExpression,
  name: string,
): LiteralValue | undefined {
  const prop = obj.getProperty(name);
  const node =
    prop && Node.isShorthandPropertyAssignment(prop)
      ? prop.getNameNode()
      : prop && Node.isPropertyAssignment(prop)
        ? prop.getInitializer()
        : undefined;
  if (!node) return undefined;
  const read = literalToValue(node);
  return read.fullyLiteral ? read.value : undefined;
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
