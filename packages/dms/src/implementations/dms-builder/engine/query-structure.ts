import type {
  ConfigValue,
  QueryOutputKind,
  QueryStructure,
  ResourceRef,
} from "@antelopejs/interface-dms-builder";
import {
  type BinaryExpression,
  type CallExpression,
  type ClassDeclaration,
  type MethodDeclaration,
  type NewExpression,
  Node,
  type ParameterDeclaration,
  SyntaxKind,
} from "ts-morph";
import { stringLiteralValue } from "./literals";
import { outputForResponseKey, arrangementForHelper } from "./query-emit";
import {
  getQueryTemplate,
  parseModelMethod,
  type ParsedParams,
  type QueryParams,
} from "./query-template";
import { findResourceBySymbol, findResourceRecord } from "./resource-index";
import { isPlainObject } from "./value";
import { getWritableProject } from "./writable";

export const MODEL_DECORATORS = ["Model", "TenantScopedModel"];

/** What a generated query route imports beyond its model, for pruning. */
export const ROUTE_GUARD_SYMBOLS = ["AuthUserWithPermission", "User"];
const ROUTE_DECORATORS = ["Get", "Post", "Put", "Patch", "Delete"];
const PARAM_SOURCES = new Set<ParamSource>(["query", "param", "header"]);

/** One argument of a route's call into its model method, per the §4 grammar. */
type QueryArg =
  | { kind: "literal"; text: string }
  | { kind: "param"; name: string; coerce?: "number" | "date" | "boolean" };

export interface QueryRouteCall {
  modelMethod: string;
  args: QueryArg[];
  /** What the route answers, read from what its response is built out of. */
  output: QueryOutputKind;
  /** The arrangement a helper applied, when one did. */
  response?: QueryStructure["response"];
  /** Whether the helper is handed the preceding period too. */
  compare?: boolean;
}

export interface QueryRoute {
  method: MethodDeclaration;
  name: string;
  endpoint: string;
}

/**
 * Hop 1 — the query routes on a page, found by what they *are* rather than
 * where they sit. A query route is a `@Get` that injects a known resource's
 * model and returns a scalar from it; the URL is free, and a hand-written route
 * matching the shape is as much a query as a generated one.
 */
export function findQueryRoutes(pageClass: ClassDeclaration): QueryRoute[] {
  const routes: QueryRoute[] = [];
  for (const method of pageClass.getMethods()) {
    const endpoint = getDecoratorPath(method, "Get");
    if (endpoint !== undefined && isQueryRouteMethod(method)) {
      routes.push({ method, name: method.getName(), endpoint });
    }
  }
  return routes;
}

/** The page's query route of a given name, if it has one. */
export function findQueryRoute(
  pageClass: ClassDeclaration,
  name: string,
): QueryRoute | undefined {
  return findQueryRoutes(pageClass).find((route) => route.name === name);
}

/** Every path the page serves, for endpoint-collision checks. */
export function pageRoutePaths(
  pageClass: ClassDeclaration,
  except?: MethodDeclaration,
): string[] {
  const paths: string[] = [];
  for (const method of pageClass.getMethods()) {
    if (method === except) {
      continue;
    }
    for (const verb of ROUTE_DECORATORS) {
      const path = getDecoratorPath(method, verb);
      if (path !== undefined) {
        paths.push(path);
      }
    }
  }
  return paths;
}

/** Hop 2 — the resource whose model a route injects, or `undefined` if it injects none. */
function routeResourceRef(method: MethodDeclaration): string | undefined {
  return resolveRouteResource(method)?.ref;
}

function resolveRouteResource(
  method: MethodDeclaration,
): { ref: string } | undefined {
  const modelClassName = routeModelClassName(method);
  const found = modelClassName
    ? findResourceBySymbol(modelClassName)
    : undefined;
  return found?.as === "model" ? { ref: found.ref } : undefined;
}

/**
 * A route counts as a query when its body reads as one, or — when the body has
 * drifted past the grammar — when it still calls a model method that parses as a
 * chain. The second case is what lets a mangled route read back
 * `unparseable_route` instead of vanishing.
 */
function isQueryRouteMethod(method: MethodDeclaration): boolean {
  const resource = resolveRouteResource(method);
  if (!resource) {
    return false;
  }
  return (
    parseQueryRouteCall(method) !== undefined ||
    callsParseableModelMethod(method, resource.ref)
  );
}

/**
 * The parseable model methods a route body calls — the query methods it binds to
 * even when the route itself has drifted off-grammar. This is what lets an opaque
 * route's backing method still be found for caller-counting and orphan cleanup.
 */
function routeModelMethodNames(
  method: MethodDeclaration,
  resource: string,
): string[] {
  const record = findResourceRecord(resource);
  const modelClass = record?.tableClass
    .getSourceFile()
    .getClass(record.modelName);
  const body = method.getBody();
  const modelName = modelParameter(method)?.getName();
  if (!modelClass || !body || !modelName) {
    return [];
  }
  const names = new Set<string>();
  for (const access of body.getDescendantsOfKind(
    SyntaxKind.PropertyAccessExpression,
  )) {
    const receiver = access.getExpression();
    if (!Node.isIdentifier(receiver) || receiver.getText() !== modelName) {
      continue;
    }
    const called = modelClass.getMethod(access.getName());
    if (called && parseModelMethod(called) !== undefined) {
      names.add(access.getName());
    }
  }
  return [...names];
}

/**
 * The resource a query route reads and the model methods it calls: what is left
 * without a caller once the route is gone. A route that drifted off-grammar has
 * no parsed call, so its methods are recovered by scanning the body.
 */
export function routeModelBinding(
  method: MethodDeclaration,
): { resource: string; methods: string[] } | undefined {
  const resource = routeResourceRef(method);
  if (resource === undefined) {
    return undefined;
  }
  const call = parseQueryRouteCall(method);
  return {
    resource,
    methods: call
      ? [call.modelMethod]
      : routeModelMethodNames(method, resource),
  };
}

function callsParseableModelMethod(
  method: MethodDeclaration,
  resource: string,
): boolean {
  return routeModelMethodNames(method, resource).length > 0;
}

function getDecoratorPath(
  method: MethodDeclaration,
  name: string,
): string | undefined {
  const decorator = method.getDecorator(name);
  return stringLiteralValue(decorator?.getCallExpression()?.getArguments()[0]);
}

function modelParameter(
  method: MethodDeclaration,
): ParameterDeclaration | undefined {
  return method
    .getParameters()
    .find((parameter) =>
      MODEL_DECORATORS.some((name) => parameter.getDecorator(name)),
    );
}

/** Hop 2 — the model class a route injects, as a bare identifier. */
function routeModelClassName(method: MethodDeclaration): string | undefined {
  const parameter = modelParameter(method);
  if (!parameter) {
    return undefined;
  }
  for (const name of MODEL_DECORATORS) {
    const argument = parameter
      .getDecorator(name)
      ?.getCallExpression()
      ?.getArguments()[0];
    if (argument && Node.isIdentifier(argument)) {
      return argument.getText();
    }
  }
  return undefined;
}

/** The argument of a one-argument call to `calleeName`, or `undefined`. */
function calledWith(
  node: CallExpression | NewExpression,
  calleeName: string,
): Node | undefined {
  const callee = node.getExpression();
  const args = node.getArguments();
  return Node.isIdentifier(callee) &&
    callee.getText() === calleeName &&
    args.length === 1
    ? args[0]
    : undefined;
}

/**
 * The parameter a route hands on as text: `x`, or `String(x)`, which is how a
 * `QueryValue` read from the query string is narrowed to text.
 */
function textParam(node: Node | undefined): string | undefined {
  const text =
    node && Node.isCallExpression(node) ? calledWith(node, "String") : node;
  return text && Node.isIdentifier(text) ? text.getText() : undefined;
}

/**
 * `Number(x)` and `new Date(x)` both read as the parameter `x` carrying a
 * coercion, as does `new Date(String(x))`. Anything else in that position is
 * not a shape this can describe.
 */
function coercedParam(
  node: CallExpression | NewExpression,
  calleeName: string,
  coerce: "number" | "date",
): QueryArg | undefined {
  const name = textParam(calledWith(node, calleeName));
  return name ? { kind: "param", name, coerce } : undefined;
}

/** `x === "true"` is how a boolean parameter arrives from a query string. */
function booleanParam(node: BinaryExpression): QueryArg | undefined {
  const left = node.getLeft();
  const right = node.getRight();
  if (
    node.getOperatorToken().getKind() === SyntaxKind.EqualsEqualsEqualsToken &&
    Node.isIdentifier(left) &&
    Node.isStringLiteral(right) &&
    right.getLiteralValue() === "true"
  ) {
    return { kind: "param", name: left.getText(), coerce: "boolean" };
  }
  return undefined;
}

function unwrapArgument(node: Node): QueryArg | undefined {
  if (Node.isIdentifier(node)) {
    return { kind: "param", name: node.getText() };
  }
  if (Node.isCallExpression(node)) {
    const text = textParam(node);
    return text
      ? { kind: "param", name: text }
      : coercedParam(node, "Number", "number");
  }
  if (Node.isNewExpression(node)) {
    return coercedParam(node, "Date", "date");
  }
  if (Node.isBinaryExpression(node)) {
    return booleanParam(node);
  }
  if (
    Node.isStringLiteral(node) ||
    Node.isNumericLiteral(node) ||
    Node.isTrueLiteral(node) ||
    Node.isFalseLiteral(node) ||
    Node.isNullLiteral(node)
  ) {
    return { kind: "literal", text: node.getText() };
  }
  return undefined;
}

function unwrapReturnedCall(method: MethodDeclaration) {
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
  return Node.isCallExpression(call) ? { call, output } : undefined;
}

/** What unwrapping a route's return produced: the call, and how it was dressed. */
interface UnwrappedResponse {
  call: CallExpression;
  output: QueryOutputKind;
  response?: QueryStructure["response"];
  compare?: boolean;
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
 * `return chartCardData(await model.m(...), { … })` — the arrangements a helper
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
    call: inner,
    output: "series",
    response: arrangement,
    compare: comparesPrevious(options) || undefined,
  };
}

/**
 * Hop 3 — the single `return { value: await model.<method>(...) }` call in a
 * route body, matched as a shape rather than evaluated. Anything outside the
 * grammar yields `undefined`, which the caller reports as `unparseable_route`.
 */
export function parseQueryRouteCall(
  method: MethodDeclaration,
): QueryRouteCall | undefined {
  const unwrapped = unwrapReturnedCall(method);
  if (!unwrapped) {
    return undefined;
  }
  const { call, output, response, compare } = unwrapped;
  const callee = call.getExpression();
  if (!Node.isPropertyAccessExpression(callee)) {
    return undefined;
  }
  const receiver = callee.getExpression();
  const modelParam = modelParameter(method);
  if (
    !Node.isIdentifier(receiver) ||
    !modelParam ||
    receiver.getText() !== modelParam.getName()
  ) {
    return undefined;
  }
  const paramNames = new Set(
    method.getParameters().map((parameter) => parameter.getName()),
  );
  const args: QueryArg[] = [];
  for (const argument of call.getArguments()) {
    const parsed = unwrapArgument(argument);
    if (!parsed) {
      return undefined;
    }
    if (parsed.kind === "param" && !paramNames.has(parsed.name)) {
      return undefined;
    }
    args.push(parsed);
  }
  return {
    modelMethod: callee.getName(),
    args,
    output,
    response,
    compare,
  };
}

type ParamSource = "query" | "param" | "header";

/** Whether a parameter's declared source is one a route can read from. */
function isParamSource(value: string): value is ParamSource {
  return [...PARAM_SOURCES].some((source) => source === value);
}

/**
 * The route's declared parameters. `@Parameter` defaults to `query` when its
 * source is omitted, and a hand-written route may bind a `header` — reporting
 * that as `query` would describe a binding the caller cannot reproduce.
 */
function routeParams(
  method: MethodDeclaration,
): { name: string; in: ParamSource }[] {
  const params: { name: string; in: ParamSource }[] = [];
  for (const parameter of method.getParameters()) {
    const args = parameter
      .getDecorator("Parameter")
      ?.getCallExpression()
      ?.getArguments();
    const name = stringLiteralValue(args?.[0]);
    if (!name) {
      continue;
    }
    const source = stringLiteralValue(args?.[1]) ?? "query";
    params.push({
      name,
      in: isParamSource(source) ? source : "query",
    });
  }
  return params;
}

function findModelMethod(
  resource: ResourceRef,
  modelMethod: string,
): MethodDeclaration | undefined {
  const record = findResourceRecord(resource);
  if (!record) {
    return undefined;
  }
  return getWritableProject()
    .getSourceFile(record.databaseFile)
    ?.getClass(record.modelName)
    ?.getMethod(modelMethod);
}

/**
 * Resolves a parsed method's `$bind` sentinels into public `$param` bindings by
 * following each to the route: the model parameter it names → its position in
 * the signature → the route argument in that slot → the route's `@Parameter`
 * name and source. Returns `undefined` if a bound value cannot be traced to a
 * `query`/`param` route parameter, which degrades the whole query to opaque —
 * the route no longer supplies what the chain reads.
 */
function resolveBindings(
  params: ParsedParams,
  method: MethodDeclaration,
  call: QueryRouteCall,
  route: { name: string; in: ParamSource }[],
): QueryParams | undefined {
  if (!params.where) {
    return params;
  }
  const positionOf = new Map(
    method
      .getParameters()
      .map((parameter, index) => [parameter.getName(), index]),
  );
  const where: ConfigValue[] = [];
  for (const filter of params.where) {
    const name = isPlainObject(filter.value) ? filter.value.$bind : undefined;
    if (name === undefined) {
      where.push(filter);
      continue;
    }
    const position = positionOf.get(name);
    const argument = position !== undefined ? call.args[position] : undefined;
    if (!argument || argument.kind !== "param") {
      return undefined;
    }
    const routeParam = route.find((param) => param.name === argument.name);
    if (!routeParam || routeParam.in === "header") {
      return undefined;
    }
    where.push({
      field: filter.field,
      op: filter.op,
      value: { $param: { name: routeParam.name, in: routeParam.in } },
    });
  }
  return { ...params, where };
}

/** Read-back for every query route on a page. */
export function buildQueryStructures(
  pageClass: ClassDeclaration,
): QueryStructure[] {
  return findQueryRoutes(pageClass).map((route) => buildQueryStructure(route));
}

/**
 * Read one query route back into a structure.
 *
 * The route's own response is read from the route, so a query whose calculation
 * no longer parses still reports what it answers with, and it wins over the
 * template's output.
 */
export function buildQueryStructure(route: QueryRoute): QueryStructure {
  const params = routeParams(route.method);
  const base: QueryStructure = {
    name: route.name,
    endpoint: route.endpoint,
    routeParams: params,
  };
  const modelClassName = routeModelClassName(route.method);
  const resource = modelClassName
    ? findResourceBySymbol(modelClassName)
    : undefined;
  if (resource) {
    base.resource = resource.ref;
  }
  const call = parseQueryRouteCall(route.method);
  if (!call || !resource) {
    return { ...base, opaque: true, opaqueReason: "unparseable_route" };
  }
  base.modelMethod = call.modelMethod;
  base.output = call.output;
  const method = findModelMethod(resource.ref, call.modelMethod);
  const parsed = method ? parseModelMethod(method) : undefined;
  if (!method || !parsed) {
    return { ...base, opaque: true, opaqueReason: "unparseable_chain" };
  }
  const resolved = resolveBindings(parsed.params, method, call, params);
  if (!resolved) {
    return { ...base, opaque: true, opaqueReason: "unparseable_chain" };
  }
  if (call.response) {
    base.response = call.response;
  }
  if (call.compare) {
    base.compare = true;
  }
  return {
    ...base,
    template: parsed.template,
    params: resolved,
    /**
     * The route's own response wins: a body edited to answer something else is
     * what a caller will actually receive, whatever its chain still parses as.
     */
    output: call.output ?? getQueryTemplate(parsed.template)?.descriptor.output,
  };
}
