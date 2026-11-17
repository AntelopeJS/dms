/**
 * Emission of a query method into the model, and the public operations that
 * call it.
 */

import type {
  AddQueryInput,
  MutationOpts,
  OpResult,
  QueryRef,
} from "@antelopejs/interface-dms-builder";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import { type ClassDeclaration, type SourceFile, SyntaxKind } from "ts-morph";
import { applyImportRef } from "./emit";
import {
  checkVersion,
  commit,
  isError,
  notFound,
  opaque,
  unsupported,
  openPage,
} from "./ops";
import {
  type ModelTarget,
  parseQueryRef,
  queryModelMethodText,
  queryRef,
  queryRouteMethodText,
} from "./query-emit";
import {
  buildQueryStructure,
  findQueryRoute,
  MODEL_DECORATORS,
  ROUTE_GUARD_SYMBOLS,
  routeModelBinding,
} from "./query-structure";
import { findResourceRecord } from "./resource-index";
import {
  bindsNothing,
  findPageClass,
  getWritableProject,
  Transaction,
} from "./writable";
import {
  AddQueryData,
  checkCollisions,
  compileQuery,
  isGenerated,
  modelMethodCallers,
  openModel,
  OpenModel,
  QueryEmission,
  resolveModelTarget,
} from "./query-ops";
/**
 * Write a query's model method and route.
 *
 * The permission guard names the page class, so a page class without a name is
 * refused: the emitted `@AuthUserWithPermission()` would not compile.
 */
export function emitQuery({
  pageClass,
  pageFile,
  opened,
  spec,
  ref,
  transaction,
  preferred,
}: QueryEmission): ModelTarget | OpResult<never> {
  transaction.track(pageFile);
  transaction.track(opened.databaseFile);
  const target = resolveModelTarget(opened, spec, preferred, ref);
  if ("ok" in target) {
    return target;
  }
  if (!target.reuse) {
    writeModelMethod(
      opened,
      target.name,
      queryModelMethodText(spec, target.name),
    );
  }
  const pageClassName = pageClass.getName();
  if (!pageClassName) {
    return unsupported<never>(
      "the page class has no name, so a generated route cannot name it in its permission guard",
    );
  }
  const route = queryRouteMethodText(
    spec,
    opened.record.modelName,
    opened.record.schema,
    target.name,
    pageClassName,
  );
  pageClass.addMember(route.text);
  for (const symbol of route.symbols) {
    applyImportRef(pageFile, symbol);
  }
  applyImportRef(pageFile, {
    name: opened.record.modelName,
    targetFile: opened.record.databaseFile,
  });
  return target;
}

function writeModelMethod(opened: OpenModel, name: string, text: string): void {
  const existing = opened.modelClass.getMethod(name);
  if (existing) {
    existing.replaceWithText(text.trim());
    return;
  }
  opened.modelClass.addMember(text);
}

/**
 * Writes a query's route and model method inside a transaction the caller owns
 * and commits, so several queries can share one typecheck. Refuses before it
 * mutates anything.
 */
export function stageQuery(
  page: string,
  sourceFile: SourceFile,
  pageClass: ClassDeclaration,
  input: AddQueryInput,
  transaction: Transaction,
): OpResult<AddQueryData> {
  const record = findResourceRecord(input.resource);
  if (!record) {
    return notFound<AddQueryData>(input.resource);
  }
  const opened = openModel(record);
  if (!opened) {
    return notFound<AddQueryData>(input.resource);
  }
  const spec = compileQuery(input, record);
  if ("ok" in spec) {
    return spec;
  }
  const ref = queryRef(page, input.name);
  const collision = checkCollisions(pageClass, opened.modelClass, spec);
  if (collision) {
    return collision;
  }
  const target = emitQuery({
    pageClass,
    pageFile: sourceFile,
    opened,
    spec,
    ref,
    transaction,
    preferred: spec.name,
  });
  if ("ok" in target) {
    return target;
  }
  return {
    ok: true,
    data: { query: ref, route: pageRoutePath(page, spec.endpoint) },
    changes: [],
    warnings: spec.chain.warnings ?? [],
  };
}

export function addQuery(
  page: string,
  input: AddQueryInput,
  opts?: MutationOpts,
): OpResult<AddQueryData> {
  const context = openPage(page);
  if (isError<AddQueryData>(context)) {
    return context;
  }
  if (!findResourceRecord(input.resource)) {
    return notFound<AddQueryData>(input.resource);
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const pageClass = findPageClass(context.sourceFile, context.page.id);
  if (!pageClass) {
    return notFound<AddQueryData>(page);
  }
  const transaction = new Transaction(getWritableProject());
  const staged = stageQuery(
    page,
    context.sourceFile,
    pageClass,
    input,
    transaction,
  );
  if (!staged.ok) {
    transaction.rollback();
    return staged;
  }
  return commit(transaction, staged.data, staged.warnings);
}

/**
 * Recompiles a query from the merged patch and replaces both members. Refuses an
 * opaque target: a hash mismatch means a human owns that chain now, and
 * regenerating it from a marker it no longer matches would revert their edit.
 */
/**
 * Walks a query ref down to the route it names and the structure currently
 * written there, refusing anything the builder cannot describe: a ref that does
 * not parse, a page or route that is gone, a stale version, or a route whose
 * body was hand-edited past what the templates can express.
 */
function locateQuery(query: QueryRef, opts: MutationOpts | undefined) {
  const parsed = parseQueryRef(query);
  if (!parsed) {
    return notFound(query);
  }
  const context = openPage(parsed.page);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const pageClass = findPageClass(context.sourceFile, context.page.id);
  const route = pageClass ? findQueryRoute(pageClass, parsed.name) : undefined;
  if (!pageClass || !route) {
    return notFound(query);
  }
  const current = buildQueryStructure(route);
  if (current.opaque || !current.template || !current.resource) {
    return opaque(query);
  }
  return {
    parsed,
    context,
    pageClass,
    route,
    current,
    resource: current.resource,
    template: current.template,
  };
}

export function configureQuery(
  query: QueryRef,
  patch: Partial<AddQueryInput>,
  opts?: MutationOpts,
): OpResult {
  const located = locateQuery(query, opts);
  if (!("route" in located)) {
    return located;
  }
  const { parsed, context, pageClass, route, current, resource, template } =
    located;
  const previous = {
    resource,
    modelMethod: current.modelMethod ?? parsed.name,
  };
  const input: AddQueryInput = {
    name: parsed.name,
    resource: patch.resource ?? resource,
    template: patch.template ?? template,
    params: patch.params ?? current.params,
    response: patch.response ?? current.response,
    compare: patch.compare ?? current.compare,
    endpoint: patch.endpoint ?? route.endpoint,
  };
  const record = findResourceRecord(input.resource);
  if (!record) {
    return notFound(input.resource);
  }
  const opened = openModel(record);
  if (!opened) {
    return notFound(input.resource);
  }
  const spec = compileQuery(input, record);
  if ("ok" in spec) {
    return spec;
  }
  const collision = checkCollisions(
    pageClass,
    opened.modelClass,
    spec,
    route.method,
  );
  if (collision) {
    return collision;
  }
  const transaction = new Transaction(getWritableProject());
  transaction.track(context.sourceFile);
  transaction.track(opened.databaseFile);
  route.method.remove();
  const target = emitQuery({
    pageClass,
    pageFile: context.sourceFile,
    opened,
    spec,
    ref: query,
    transaction,
    /**
     * Retarget the method this query already calls, so a query that was forked
     * off a shared one keeps editing its own fork.
     */
    preferred:
      previous.resource === input.resource ? previous.modelMethod : spec.name,
  });
  if ("ok" in target) {
    transaction.rollback();
    return target;
  }
  if (
    previous.resource !== input.resource ||
    previous.modelMethod !== target.name
  ) {
    dropOrphanedModelMethod(
      previous.resource,
      previous.modelMethod,
      transaction,
    );
  }
  pruneUnusedImports(context.sourceFile, [
    "Parameter",
    ...MODEL_DECORATORS,
    ...ROUTE_GUARD_SYMBOLS,
    ...modelClassNames(previous.resource),
  ]);
  return commit(transaction, undefined, spec.chain.warnings ?? []);
}

/** The model class a resource's routes import, for pruning after a rebind. */
function modelClassNames(resource: string): string[] {
  const name = findResourceRecord(resource)?.modelName;
  return name ? [name] : [];
}

/**
 * Remove a query's route and, when it was the last caller, its model method.
 *
 * The route's model binding is read before the route is removed: an opaque
 * route's backing method is recovered from its body.
 */
export function removeQuery(query: QueryRef, opts?: MutationOpts): OpResult {
  const parsed = parseQueryRef(query);
  if (!parsed) {
    return notFound(query);
  }
  const context = openPage(parsed.page);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const pageClass = findPageClass(context.sourceFile, context.page.id);
  const route = pageClass ? findQueryRoute(pageClass, parsed.name) : undefined;
  if (!route) {
    return notFound(query);
  }
  const binding = routeModelBinding(route.method);
  const transaction = new Transaction(getWritableProject());
  transaction.track(context.sourceFile);
  route.method.remove();
  pruneUnusedImports(context.sourceFile, [
    "Get",
    "Parameter",
    ...MODEL_DECORATORS,
    ...ROUTE_GUARD_SYMBOLS,
    ...(binding ? modelClassNames(binding.resource) : []),
  ]);
  if (binding) {
    for (const modelMethod of binding.methods) {
      dropOrphanedModelMethod(binding.resource, modelMethod, transaction);
    }
  }
  return commit(transaction, undefined);
}

function isReferencedOutsideImports(
  sourceFile: SourceFile,
  name: string,
): boolean {
  return sourceFile
    .getDescendantsOfKind(SyntaxKind.Identifier)
    .some(
      (identifier) =>
        identifier.getText() === name &&
        !identifier.getFirstAncestorByKind(SyntaxKind.ImportDeclaration),
    );
}

/**
 * Drops named imports a removed member was the last user of. Leaving them would
 * be dead code, and under `noUnusedLocals` it would fail the typecheck gate on
 * the *next* operation rather than this one.
 *
 * Only declarations this call emptied are removed: an import that bound nothing
 * to begin with is a side-effect import, and dropping it would silently undo
 * whatever loading the module does.
 */
function pruneUnusedImports(sourceFile: SourceFile, names: string[]): void {
  for (const declaration of sourceFile.getImportDeclarations()) {
    if (bindsNothing(declaration)) {
      continue;
    }
    for (const specifier of declaration.getNamedImports()) {
      const name = specifier.getAliasNode()?.getText() ?? specifier.getName();
      if (
        names.includes(name) &&
        !isReferencedOutsideImports(sourceFile, name)
      ) {
        specifier.remove();
      }
    }
    if (bindsNothing(declaration)) {
      declaration.remove();
    }
  }
}

/** Drops the model method only once no route on any page still calls it. */
export function dropOrphanedModelMethod(
  resource: string,
  modelMethod: string,
  transaction: Transaction,
): void {
  if (modelMethodCallers(resource, modelMethod).length > 0) {
    return;
  }
  const record = findResourceRecord(resource);
  const opened = record ? openModel(record) : undefined;
  const method = opened?.modelClass.getMethod(modelMethod);
  if (!opened || !method || !isGenerated(method)) {
    return;
  }
  transaction.track(opened.databaseFile);
  method.remove();
}
