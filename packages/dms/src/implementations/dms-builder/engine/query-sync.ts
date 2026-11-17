/**
 * Reconciling a page's queries against a draft, inside the caller's transaction.
 *
 * A block and the data it reads are one edit, so they are one write: the draft
 * carries both, and this brings the file's queries in line with it without
 * committing anything of its own. What the caller commits, it commits whole.
 */

import type {
  AddQueryInput,
  BlockDraft,
  ConfigValue,
  OpResult,
  OpWarning,
  QueryStructure,
} from "@antelopejs/interface-dms-builder";
import { pageRoutePath } from "@antelopejs/interface-dms/page";
import type { ClassDeclaration, SourceFile } from "ts-morph";
import { invalidConfig, notFound } from "./ops";
import { queryRef } from "./query-emit";
import {
  checkCollisions,
  compileQuery,
  openModel,
  type OpenModel,
} from "./query-ops";
import { dropOrphanedModelMethod, emitQuery } from "./query-ops-emit";
import {
  buildQueryStructure,
  findQueryRoute,
  findQueryRoutes,
} from "./query-structure";
import { findResourceRecord } from "./resource-index";
import { isString } from "./scalar-guards";
import { isPlainObject } from "./value";
import type { Transaction } from "./writable";

interface SyncContext {
  page: string;
  pageFile: SourceFile;
  pageClass: ClassDeclaration;
  transaction: Transaction;
  /** The blocks being written, so a query one of them reads is never dropped. */
  blocks: BlockDraft[];
}

/**
 * Every string a block's configuration carries, at any depth.
 *
 * A block points at its data by URL, so what a page still needs is discovered by
 * looking for that URL rather than by trusting the draft to have listed it.
 */
function configuredStrings(blocks: BlockDraft[], found: Set<string>): void {
  const walk = (value: ConfigValue): void => {
    if (isString(value)) {
      found.add(value);
      return;
    }
    if (Array.isArray(value)) {
      value.forEach(walk);
      return;
    }
    if (isPlainObject(value)) {
      Object.values(value).forEach(walk);
    }
  };
  for (const block of blocks) {
    walk(block.config);
    if (block.children) {
      configuredStrings(block.children, found);
    }
  }
}

/** Whether a block still reads this query's route. */
function isRead(context: SyncContext, query: QueryStructure): boolean {
  const urls = new Set<string>();
  configuredStrings(context.blocks, urls);
  return urls.has(pageRoutePath(context.page, query.endpoint));
}

/** A query already written on the page, by name. */
function existingByName(
  pageClass: ClassDeclaration,
): Map<string, QueryStructure> {
  const found = new Map<string, QueryStructure>();
  for (const route of findQueryRoutes(pageClass)) {
    const structure = buildQueryStructure(route);
    found.set(structure.name, structure);
  }
  return found;
}

function opaqueWarning(name: string, action: string): OpWarning {
  return {
    code: "query_opaque",
    message: `query "${name}" was edited by hand and is no longer one the builder can read; it was left as it is rather than ${action}`,
  };
}

function openFor(input: AddQueryInput): OpenModel | OpResult<never> {
  const record = findResourceRecord(input.resource);
  if (!record) {
    return notFound<never>(input.resource);
  }
  const opened = openModel(record);
  return opened ?? notFound<never>(input.resource);
}

/**
 * Write one query, replacing the route already serving that name.
 *
 * The method the previous route called is the preferred target, so a query that
 * was forked off a shared method keeps editing its own fork rather than
 * wandering back onto a method another query depends on.
 */
function writeQuery(
  context: SyncContext,
  input: AddQueryInput,
  previous: QueryStructure | undefined,
): OpWarning[] | OpResult<never> {
  const opened = openFor(input);
  if ("ok" in opened) {
    return opened;
  }
  const spec = compileQuery(input, opened.record);
  if ("ok" in spec) {
    return spec;
  }
  const route = previous
    ? findQueryRoute(context.pageClass, previous.name)
    : undefined;
  const collision = checkCollisions(
    context.pageClass,
    opened.modelClass,
    spec,
    route?.method,
  );
  if (collision) {
    return collision;
  }
  route?.method.remove();
  const target = emitQuery({
    pageClass: context.pageClass,
    pageFile: context.pageFile,
    opened,
    spec,
    ref: queryRef(context.page, input.name),
    transaction: context.transaction,
    preferred: previous?.modelMethod ?? spec.name,
  });
  if ("ok" in target) {
    return target;
  }
  if (
    previous?.resource !== undefined &&
    previous.modelMethod !== undefined &&
    previous.modelMethod !== target.name
  ) {
    dropOrphanedModelMethod(
      previous.resource,
      previous.modelMethod,
      context.transaction,
    );
  }
  return spec.chain.warnings ?? [];
}

/**
 * Remove a query the draft no longer carries, with the method it called.
 *
 * A query a block still reads is kept with a warning instead: a draft that
 * forgot to list a source would otherwise break that block.
 */
function removeQuery(
  context: SyncContext,
  current: QueryStructure,
): OpWarning[] {
  if (current.opaque) {
    return [opaqueWarning(current.name, "removed")];
  }
  if (isRead(context, current)) {
    return [
      {
        code: "query_kept",
        message: `query "${current.name}" is not in the draft but a block on the page still reads ${pageRoutePath(context.page, current.endpoint)}, so it was kept`,
      },
    ];
  }
  const route = findQueryRoute(context.pageClass, current.name);
  route?.method.remove();
  if (current.resource && current.modelMethod) {
    dropOrphanedModelMethod(
      current.resource,
      current.modelMethod,
      context.transaction,
    );
  }
  return [];
}

function duplicateNames(drafts: AddQueryInput[]): string | undefined {
  const seen = new Set<string>();
  for (const draft of drafts) {
    if (seen.has(draft.name)) {
      return draft.name;
    }
    seen.add(draft.name);
  }
  return undefined;
}

/**
 * Bring the page's queries in line with the draft: write the ones it carries,
 * drop the generated ones it no longer does, and leave alone any a human has
 * taken over — reported as a warning rather than silently reverted or deleted.
 *
 * Nothing is committed here. The caller holds the transaction, so the blocks and
 * the data they read land in one write and one typecheck, or not at all.
 *
 * Removals run before writes: a draft that renames a query frees its name and
 * its endpoint, and writing first would collide with what it replaces.
 */
export function syncQueries(
  context: SyncContext,
  drafts: AddQueryInput[],
): OpWarning[] | OpResult<never> {
  const duplicate = duplicateNames(drafts);
  if (duplicate) {
    return invalidConfig<never>(
      `two queries in the draft are named "${duplicate}"; a page serves one route per name`,
    );
  }
  const current = existingByName(context.pageClass);
  const warnings: OpWarning[] = [];

  const kept = new Set(drafts.map((draft) => draft.name));
  for (const [name, structure] of current) {
    if (!kept.has(name)) {
      warnings.push(...removeQuery(context, structure));
    }
  }

  for (const draft of drafts) {
    const previous = current.get(draft.name);
    if (previous?.opaque) {
      warnings.push(opaqueWarning(draft.name, "rewritten"));
      continue;
    }
    const written = writeQuery(context, draft, previous);
    if ("ok" in written) {
      return written;
    }
    warnings.push(...written);
  }
  return warnings;
}
