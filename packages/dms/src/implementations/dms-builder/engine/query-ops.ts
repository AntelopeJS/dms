import { interfaceNamesBuckets } from "./interface-capabilities";
import type {
  AddQueryInput,
  OpResult,
  QueryRef,
  ResourceFieldStructure,
  ValidationIssue,
} from "@antelopejs/interface-dms-builder";
import {
  type ClassDeclaration,
  type MethodDeclaration,
  type SourceFile,
} from "ts-morph";
import { duplicate, invalidConfig, opaque } from "./ops";
import { isIdentifier } from "./paths";
import { canonicalBody } from "./query-chain";
import { emitPlan } from "./query-plan";
import {
  type CompiledQuery,
  defaultEndpoint,
  type ModelTarget,
  seriesNaming,
} from "./query-emit";
import {
  findQueryRoutes,
  pageRoutePaths,
  routeModelBinding,
} from "./query-structure";
import {
  getQueryTemplate,
  templateParamIssues,
  type MethodParam,
  parseModelMethod,
} from "./query-template";
import { type ResourceRecord } from "./resource-index";
import {
  indexedFieldNames,
  readDataApiFieldAspects,
} from "./resource-structure";
import { listPageRecords } from "./source-index";
import { findPageClass, getWritableProject, Transaction } from "./writable";
import { describeValue } from "./describe-value";

/**
 * Members the `PageController` stamps on the prototype, plus the page's own
 * static blocks, are all in the route method's namespace — a query named after
 * one of them would silently shadow it.
 */
const PAGE_RESERVED_MEMBERS = new Set(["user", "roleModel", "memberModel"]);

/**
 * What `BasicDataModel` already puts on the model instance. A query method of
 * one of these names would override it, breaking every other query on the
 * resource rather than just its own.
 */
const MODEL_RESERVED_MEMBERS = new Set([
  "table",
  "database",
  "get",
  "getBy",
  "getAll",
  "insert",
  "update",
  "delete",
]);

/** How many suffixed names to try before giving up on forking a shared method. */
const MAX_METHOD_SUFFIX = 99;

export type AddQueryData = { query: QueryRef; route: string };

export interface OpenModel {
  databaseFile: SourceFile;
  modelClass: ClassDeclaration;
  record: ResourceRecord;
}

function invalidIssues<T = void>(issues: ValidationIssue[]): OpResult<T> {
  return { ok: false, error: { code: "invalid_config", issues } };
}

export function openModel(record: ResourceRecord): OpenModel | undefined {
  const project = getWritableProject();
  const databaseFile = project.getSourceFile(record.databaseFile);
  const modelClass = databaseFile?.getClass(record.modelName);
  if (!databaseFile || !modelClass) {
    return undefined;
  }
  return { databaseFile, modelClass, record };
}

function resourceFields(record: ResourceRecord): ResourceFieldStructure[] {
  const indexed = indexedFieldNames(record.tableClass);
  return record.apiClass
    .getProperties()
    .filter((property) => property.getName() !== "model")
    .map((property) => readDataApiFieldAspects(property, indexed));
}

/**
 * The member names a page class already uses. Static fields are blocks and are
 * not counted: a block's own data is the query the editor names after it, so
 * counting it as taken would leave a card unable to read anything.
 */
function pageMemberNames(pageClass: ClassDeclaration): Set<string> {
  const names = new Set(PAGE_RESERVED_MEMBERS);
  for (const member of pageClass.getMembers()) {
    if ("isStatic" in member && member.isStatic()) {
      continue;
    }
    if ("getName" in member) {
      names.add(member.getName());
    }
  }
  return names;
}

/** Whether a model method computes exactly the chain `spec` describes. */
function bodyMatches(method: MethodDeclaration, spec: CompiledQuery): boolean {
  const body = method.getBody();
  const names = method.getParameters().map((parameter) => parameter.getName());
  if (!body || names.length !== spec.chain.parameters.length) {
    return false;
  }
  return (
    canonicalBody(body.getText(), names) ===
    canonicalBody(
      spec.chain.body,
      spec.chain.parameters.map((parameter) => parameter.name),
    )
  );
}

/**
 * Whether the builder owns a model method — which, with no marker, is simply
 * whether its body still parses as a chain. Anything it can parse it can modify,
 * so a human's in-grammar edit stays builder-owned; only a body outside the
 * grammar is hands-off.
 */
export function isGenerated(method: MethodDeclaration): boolean {
  return parseModelMethod(method) !== undefined;
}

/**
 * The names a query may compile into: the method it already calls, then the
 * query's own name and its numbered forks. Sharing and forking both search this
 * list, so a chain never lands somewhere the next op would not look for it.
 */
function candidateMethodNames(
  spec: CompiledQuery,
  preferred: string,
): string[] {
  const names = [preferred, spec.name];
  for (let suffix = 2; suffix <= MAX_METHOD_SUFFIX; suffix++) {
    names.push(`${spec.name}${suffix}`);
  }
  return names.filter((name, index) => names.indexOf(name) === index);
}

/**
 * The model method this query should call. A method is shared only while every
 * query bound to it wants the identical chain: a request that diverges from what
 * a shared method compiles gets its own method rather than changing what the
 * other queries return, and one that converges back onto an existing chain binds
 * to it instead of emitting a duplicate.
 *
 * The route being rewritten is removed from the page before this runs, so it
 * does not count itself as a caller: reconfiguring a query nobody else shares
 * edits its method in place.
 *
 * A requested name held by a hand-owned chain is refused rather than forked
 * around, so the caller learns that a human owns that method.
 */
export function resolveModelTarget(
  opened: OpenModel,
  spec: CompiledQuery,
  preferred: string,
  ref: string,
): ModelTarget | OpResult<never> {
  const candidates = candidateMethodNames(spec, preferred);
  const shared = candidates.find((name) => {
    const method = opened.modelClass.getMethod(name);
    return method && isGenerated(method) && bodyMatches(method, spec);
  });
  if (shared) {
    return { name: shared, reuse: true };
  }
  const called = new Set(
    resourceQueryRoutes(opened.record.ref).flatMap(
      (binding) => binding.methods,
    ),
  );
  const writable = candidates.find((name) => {
    const method = opened.modelClass.getMethod(name);
    if (!method) {
      return true;
    }
    return isGenerated(method) && !called.has(name);
  });
  if (!writable) {
    return opaque<never>(ref);
  }
  const existing = opened.modelClass.getMethod(preferred);
  if (writable !== preferred && existing && !isGenerated(existing)) {
    return opaque<never>(ref);
  }
  return { name: writable, reuse: false };
}

interface RouteMethodBinding {
  page: string;
  route: string;
  methods: string[];
}

/**
 * Every query route bound to a resource, paired with the model methods it calls —
 * a parsed route's single target, or an opaque route's body-scanned methods. One
 * project scan backs both caller-counting and the writable-name search, rather
 * than re-parsing every page once per candidate name.
 */
function resourceQueryRoutes(resource: string): RouteMethodBinding[] {
  const project = getWritableProject();
  const bindings: RouteMethodBinding[] = [];
  for (const record of listPageRecords()) {
    const sourceFile = project.getSourceFile(record.filepath);
    const pageClass = sourceFile && findPageClass(sourceFile, record.id);
    if (!pageClass) {
      continue;
    }
    for (const route of findQueryRoutes(pageClass)) {
      const binding = routeModelBinding(route.method);
      if (binding?.resource !== resource) {
        continue;
      }
      bindings.push({
        page: record.ref,
        route: route.name,
        methods: binding.methods,
      });
    }
  }
  return bindings;
}

/** Every query route, on any page, bound to a given resource's model method. */
export function modelMethodCallers(
  resource: string,
  modelMethod: string,
): { page: string; route: string }[] {
  return resourceQueryRoutes(resource)
    .filter((binding) => binding.methods.includes(modelMethod))
    .map((binding) => ({ page: binding.page, route: binding.route }));
}

/**
 * The endpoint reaches the source inside a string literal, so it needs no
 * escaping — but a path that does not start at the page's root would read as a
 * sibling of the page rather than a route on it.
 */
function checkEndpoint(endpoint: string): ValidationIssue[] {
  return endpoint.startsWith("/")
    ? []
    : [{ pointer: "/endpoint", message: "endpoint must start with /" }];
}

/**
 * A `param`-sourced binding reads a path segment, so the endpoint must declare a
 * matching `:name`. Without it the route compiles and typechecks but the value
 * is never bound at runtime, so a mismatch is refused rather than emitted — the
 * default `/stats/…` endpoint has no segments, so `in: "param"` forces the caller
 * to supply an endpoint that does.
 */
function checkParamSegments(
  endpoint: string,
  parameters: MethodParam[],
): ValidationIssue[] {
  const segments = new Set(
    endpoint
      .split("/")
      .filter((segment) => segment.startsWith(":"))
      .map((segment) => segment.slice(1)),
  );
  return parameters
    .filter((param) => param.in === "param" && !segments.has(param.routeName))
    .map((param) => ({
      pointer: "/endpoint",
      message: `parameter "${param.routeName}" is read from the path but the endpoint "${endpoint}" has no ":${param.routeName}" segment`,
    }));
}

export function compileQuery(
  input: AddQueryInput,
  record: ResourceRecord,
): CompiledQuery | OpResult<never> {
  if (!isIdentifier(input.name)) {
    return invalidIssues<never>([
      {
        pointer: "/name",
        message: `${describeValue(input.name)} is not a valid query name; expected a camelCase identifier`,
      },
    ]);
  }
  const template = getQueryTemplate(input.template);
  if (!template) {
    return invalidConfig<never>(
      `unknown query template "${input.template}"; call ListQueryTemplates for valid ids`,
    );
  }
  const endpoint = input.endpoint ?? defaultEndpoint(input.name);
  const params = input.params ?? {};
  const fields = resourceFields(record);
  const issues = [
    ...checkEndpoint(endpoint),
    ...templateParamIssues(template, params, fields),
  ];
  if (
    params.bucket === "week" &&
    !interfaceNamesBuckets(record.dataApiFile, "week")
  ) {
    issues.push({
      pointer: "/bucket",
      message:
        "the installed @antelopejs/interface-dms cannot name a week for a reader; bucket by day or month, or update it",
    });
  }
  if (issues.length > 0) {
    return invalidIssues<never>(issues);
  }
  const chain = emitPlan(template.plan(params, fields), fields);
  const segmentIssues = checkParamSegments(endpoint, chain.parameters);
  if (segmentIssues.length > 0) {
    return invalidIssues<never>(segmentIssues);
  }
  return {
    name: input.name,
    endpoint,
    template: input.template,
    params,
    chain,
    naming: seriesNaming(
      params,
      fields,
      input.resource,
      interfaceNamesBuckets(record.dataApiFile),
    ),
    response: input.response,
    compare: input.compare,
  };
}

/**
 * `replacing` is the route this query already owns, when there is one: its name
 * and path are its own to keep, so they are excluded from the page it collides
 * against.
 */
export function checkCollisions(
  pageClass: ClassDeclaration,
  modelClass: ClassDeclaration,
  spec: CompiledQuery,
  replacing?: MethodDeclaration,
): OpResult<never> | undefined {
  if (!replacing && pageMemberNames(pageClass).has(spec.name)) {
    return duplicate<never>(spec.name, "query");
  }
  if (MODEL_RESERVED_MEMBERS.has(spec.name)) {
    return duplicate<never>(spec.name, "query");
  }
  if (pageRoutePaths(pageClass, replacing).includes(spec.endpoint)) {
    return duplicate<never>(spec.endpoint, "query");
  }
  const existing = modelClass.getMethod(spec.name);
  if (!existing && modelClass.getMember(spec.name)) {
    return duplicate<never>(spec.name, "query");
  }
  return undefined;
}

/** Everything the emitter needs to write one query onto a page. */
export interface QueryEmission {
  pageClass: ClassDeclaration;
  pageFile: SourceFile;
  opened: OpenModel;
  spec: CompiledQuery;
  ref: string;
  transaction: Transaction;
  preferred: string;
}
