import type { FilterOp } from "@antelopejs/interface-dms-builder";
import {
  type CallExpression,
  type MethodDeclaration,
  Node,
  SyntaxKind,
} from "ts-morph";
import { stringLiteralValue } from "./literals";

/** The comparison operators a filter may use, shared by validation and read-back. */
export const FILTER_OPS = new Set<FilterOp>([
  "eq",
  "ne",
  "gt",
  "ge",
  "lt",
  "le",
]);

/** The comparison operator a name spells, or `undefined` when it is none of them. */
export function filterOpNamed(name: string): FilterOp | undefined {
  return [...FILTER_OPS].find((op) => op === name);
}

/**
 * A filter's value as read off the chain: a scalar baked into the body, or a
 * reference to one of the model method's parameters (a per-request value). The
 * parameter is identified by its *model-method* name — where the route sources
 * it is the route's business, resolved separately on read-back.
 */
type RawValue =
  | { kind: "literal"; value: string | number | boolean | null }
  | { kind: "param"; name: string };

export interface RawFilter {
  field: string;
  op: FilterOp;
  value: RawValue;
}

/** A model method's body decomposed into `this.table.filter(...)*.<terminal>(...)`. */
interface RawChain {
  filters: RawFilter[];
  terminalName: string;
  terminalArgs: Node[];
}

export function propName(call: CallExpression): string | undefined {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr) ? expr.getName() : undefined;
}

export function receiver(call: CallExpression): Node | undefined {
  const expr = call.getExpression();
  return Node.isPropertyAccessExpression(expr)
    ? expr.getExpression()
    : undefined;
}

export function isThisTable(node: Node): boolean {
  return (
    Node.isPropertyAccessExpression(node) &&
    node.getName() === "table" &&
    node.getExpression().getKind() === SyntaxKind.ThisKeyword
  );
}

/** The single `return <call>;` of a method body, or `undefined` for any other shape. */
export function returnedCall(
  method: MethodDeclaration,
): CallExpression | undefined {
  const body = method.getBody();
  if (!body || !Node.isBlock(body)) {
    return undefined;
  }
  const statements = body.getStatements();
  if (statements.length !== 1) {
    return undefined;
  }
  const [statement] = statements;
  if (!Node.isReturnStatement(statement)) {
    return undefined;
  }
  const expr = statement.getExpression();
  return expr && Node.isCallExpression(expr) ? expr : undefined;
}

/**
 * A filter arrow value: a literal baked in, or a bare identifier naming a model
 * parameter. Coercions (`Number`/`new Date`) live in the route, not here — the
 * one exception is a baked date, emitted `new Date("…")`, unwrapped to its
 * literal so it compares equal to the ISO string a caller passed.
 */
function readValue(node: Node, params: Set<string>): RawValue | undefined {
  if (Node.isIdentifier(node)) {
    return params.has(node.getText())
      ? { kind: "param", name: node.getText() }
      : undefined;
  }
  if (Node.isStringLiteral(node) || Node.isNumericLiteral(node)) {
    return { kind: "literal", value: node.getLiteralValue() };
  }
  if (Node.isTrueLiteral(node)) {
    return { kind: "literal", value: true };
  }
  if (Node.isFalseLiteral(node)) {
    return { kind: "literal", value: false };
  }
  if (node.getKind() === SyntaxKind.NullKeyword) {
    return { kind: "literal", value: null };
  }
  if (Node.isNewExpression(node)) {
    const callee = node.getExpression();
    const inner = node.getArguments()?.[0];
    if (Node.isIdentifier(callee) && callee.getText() === "Date" && inner) {
      if (Node.isStringLiteral(inner) || Node.isNumericLiteral(inner)) {
        return { kind: "literal", value: inner.getLiteralValue() };
      }
    }
  }
  return undefined;
}

/** One `.filter((row) => row.key("field").op(arg))` hop, or `undefined` if off-grammar. */
export function readFilter(
  arrow: Node,
  params: Set<string>,
): RawFilter | undefined {
  if (!Node.isArrowFunction(arrow)) {
    return undefined;
  }
  const rowParams = arrow.getParameters();
  if (rowParams.length !== 1) {
    return undefined;
  }
  const rowName = rowParams[0].getName();
  const compare = arrow.getBody();
  if (!Node.isCallExpression(compare)) {
    return undefined;
  }
  const opName = propName(compare);
  const op = opName === undefined ? undefined : filterOpNamed(opName);
  if (op === undefined) {
    return undefined;
  }
  const compareArgs = compare.getArguments();
  if (compareArgs.length !== 1) {
    return undefined;
  }
  const keyCall = receiver(compare);
  if (
    !keyCall ||
    !Node.isCallExpression(keyCall) ||
    propName(keyCall) !== "key"
  ) {
    return undefined;
  }
  const keyReceiver = receiver(keyCall);
  if (
    !keyReceiver ||
    !Node.isIdentifier(keyReceiver) ||
    keyReceiver.getText() !== rowName
  ) {
    return undefined;
  }
  const field = stringLiteralValue(keyCall.getArguments()[0]);
  if (field === undefined) {
    return undefined;
  }
  const value = readValue(compareArgs[0], params);
  if (!value) {
    return undefined;
  }
  return { field, op, value };
}

/**
 * Reads a model method body as an AQL chain: `this.table`, a run of `.filter`
 * hops, and a terminal call. Returns `undefined` for anything outside that
 * grammar — the signal a template uses to reject a method it did not shape.
 */
export function readChain(method: MethodDeclaration): RawChain | undefined {
  const outer = returnedCall(method);
  if (!outer) {
    return undefined;
  }
  const terminalName = propName(outer);
  if (terminalName === undefined) {
    return undefined;
  }
  const params = new Set(method.getParameters().map((p) => p.getName()));
  const filters: RawFilter[] = [];
  let node: Node | undefined = receiver(outer);
  while (node && Node.isCallExpression(node) && propName(node) === "filter") {
    const filter = readFilter(node.getArguments()[0], params);
    if (!filter) {
      return undefined;
    }
    filters.unshift(filter);
    node = receiver(node);
  }
  if (!node || !isThisTable(node)) {
    return undefined;
  }
  return { filters, terminalName, terminalArgs: outer.getArguments() };
}

/**
 * A parsed filter, as a template's `where` params carry it: a literal baked into
 * the chain, or a `$bind` naming the model parameter that supplies the value.
 */
export type ParsedFilter = {
  field: string;
  op: FilterOp;
  value: string | number | boolean | null | { $bind: string };
};

/** The `where` a template's parameters carry once read back. */
export type ParsedWhere = { where?: ParsedFilter[] };

/**
 * A template's `where` params from parsed filters: each bound value becomes a
 * `$bind` referencing its model-method parameter, each baked value its literal.
 * Empty filters yield no `where` key — the same params a caller would omit.
 */
export function whereParams(filters: RawFilter[]): ParsedWhere {
  if (filters.length === 0) {
    return {};
  }
  return {
    where: filters.map((filter) => ({
      field: filter.field,
      op: filter.op,
      value:
        filter.value.kind === "param"
          ? { $bind: filter.value.name }
          : filter.value.value,
    })),
  };
}

/**
 * A chain's identity: its compiled body, with parameter names reduced to their
 * position and whitespace flattened.
 *
 * The code is what two queries either share or do not — comparing the parameters
 * that produced it cannot work, because a template applies defaults on the way
 * out (a series is always ordered) and a read-back reports them explicitly, so
 * the same chain hashes two ways depending on which side you came from.
 *
 * A name is only substituted where an identifier stands on its own: a parameter
 * named after a field that happens to read like an operator must not rewrite
 * `.min("x")` into `.$0("x")`.
 *
 * Whitespace around a member dot goes too, and so does a trailing comma before a
 * closing bracket — both are what wrapping a chain costs. A chain the emitter
 * wrote on one line and the project's formatter then broke onto its hops is the
 * same chain; without this the next operation would read its own output as
 * hand-owned and refuse to touch it.
 */
export function canonicalBody(body: string, parameters: string[]): string {
  let text = body
    .replace(/\s+/g, " ")
    .replace(/\s*\.\s*/g, ".")
    .replace(/,(\s*)(?=[)\]}])/g, "$1")
    .trim();
  parameters.forEach((name, index) => {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    text = text.replace(
      new RegExp(`(?<![.\\w$])${escaped}\\b`, "g"),
      `$${index}`,
    );
  });
  return text;
}
