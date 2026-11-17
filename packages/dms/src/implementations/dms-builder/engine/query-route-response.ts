import type {
  QueryOutputKind,
  QueryStructure,
} from "@antelopejs/interface-dms-builder";
import { type CallExpression, type MethodDeclaration, Node } from "ts-morph";
import { arrangementForHelper, outputForResponseKey } from "./query-emit";

/** What unwrapping a route's return produced: the call, and how it was dressed. */
export interface UnwrappedResponse {
  call: CallExpression;
  output: QueryOutputKind;
  response?: QueryStructure["response"];
  compare?: boolean;
}

/**
 * `model.m(...)` out of `model.m(...).run()`, the call a route awaits to run
 * the query the method returns. A call that is not a `.run()` over another call
 * is its own model call, so a route written before queries needed `.run()`
 * still reads back.
 */
function modelCallOf(call: CallExpression): CallExpression {
  const callee = call.getExpression();
  if (
    !Node.isPropertyAccessExpression(callee) ||
    callee.getName() !== "run" ||
    call.getArguments().length > 0
  ) {
    return call;
  }
  const query = callee.getExpression();
  return Node.isCallExpression(query) ? query : call;
}

/**
 * The model call a route's single `return` statement awaits, and how the route
 * dresses its answer: `{ <output>: await model.m(...).run() }` or a helper such
 * as `chartCardData(await model.m(...).run(), { … })`. Anything else is
 * `undefined`.
 */
export function unwrapReturnedCall(
  method: MethodDeclaration,
): UnwrappedResponse | undefined {
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
  const returned = statement.getExpression();
  if (!returned) {
    return undefined;
  }
  if (Node.isCallExpression(returned)) {
    return unwrapHelperCall(returned);
  }
  if (!Node.isObjectLiteralExpression(returned)) {
    return undefined;
  }
  const properties = returned.getProperties();
  if (properties.length !== 1) {
    return undefined;
  }
  const [property] = properties;
  if (!Node.isPropertyAssignment(property)) {
    return undefined;
  }
  const output = outputForResponseKey(property.getName());
  if (!output) {
    return undefined;
  }
  const initializer = property.getInitializer();
  if (!initializer || !Node.isAwaitExpression(initializer)) {
    return undefined;
  }
  const call = initializer.getExpression();
  return Node.isCallExpression(call)
    ? { call: modelCallOf(call), output }
    : undefined;
}

/** The option a helper is handed the preceding period's calculation under. */
const PREVIOUS_OPTION = "previous";

/** Whether a helper's options hand it the preceding period. */
function comparesPrevious(options: Node | undefined): boolean {
  return (
    !!options &&
    Node.isObjectLiteralExpression(options) &&
    options.getProperty(PREVIOUS_OPTION) !== undefined
  );
}

/**
 * `return chartCardData(await model.m(...).run(), { … })` — the arrangements a helper
 * builds rather than a property name.
 *
 * Only the first argument is the calculation; the options that follow, including
 * the preceding period's call, are read off the route separately.
 */
function unwrapHelperCall(call: CallExpression): UnwrappedResponse | undefined {
  const callee = call.getExpression();
  if (!Node.isIdentifier(callee)) {
    return undefined;
  }
  const arrangement = arrangementForHelper(callee.getText());
  if (!arrangement) {
    return undefined;
  }
  const [first, options] = call.getArguments();
  if (!first || !Node.isAwaitExpression(first)) {
    return undefined;
  }
  const inner = first.getExpression();
  if (!Node.isCallExpression(inner)) {
    return undefined;
  }
  return {
    call: modelCallOf(inner),
    output: "series",
    response: arrangement,
    compare: comparesPrevious(options) || undefined,
  };
}
