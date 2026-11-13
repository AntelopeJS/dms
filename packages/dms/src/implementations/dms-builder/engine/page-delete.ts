/**
 * Deleting a page: its class, whatever only the class used, and its file once
 * nothing else is left in it.
 */

import type { MutationOpts, OpResult } from "@antelopejs/interface-dms-builder";
import type { ClassDeclaration } from "ts-morph";
import { checkVersion, commit, isError, notFound, openPage } from "./ops";
import { dropOrphanedModelMethod } from "./query-ops-emit";
import { findQueryRoutes, routeModelBinding } from "./query-structure";
import {
  findImporters,
  findPageClass,
  holdsOnlyImports,
  pruneUnusedImports,
  pruneUnusedLocals,
  referencedImportNames,
  referencedLocalNames,
  Transaction,
} from "./writable";

/**
 * Delete a page.
 *
 * A page's file can hold more than the page. A hand-written one often declares
 * its category beside it, and every page later created in that category imports
 * the category from there: deleting the file would take the category with it
 * and leave those pages naming something that no longer exists. So the class
 * goes, with what only it used — the constants it read, the imports it needed,
 * the generated model methods its query routes called — and the file goes,
 * unwired from its barrel, only once nothing but imports is left in it.
 *
 * The file's importers are found before pruning, while it is still a module:
 * pruned down to nothing it no longer is one, and the barrel's import of it
 * stops resolving to it. Locals are pruned before imports, since a constant the
 * page read can be the last user of an import. Orphaned model methods are
 * dropped once the class is gone, so that its own routes no longer count as
 * callers.
 */
export function deletePage(ref: string, opts?: MutationOpts): OpResult {
  const context = openPage(ref);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const { sourceFile } = context;
  const pageClass = findPageClass(sourceFile, context.page.id);
  if (!pageClass) {
    return notFound(ref);
  }
  const bindings = queryBindings(pageClass);
  const usedImports = referencedImportNames(sourceFile);
  const usedLocals = referencedLocalNames(sourceFile);
  const project = sourceFile.getProject();
  const importers = findImporters(project, sourceFile.getFilePath());
  const transaction = new Transaction(project);
  transaction.track(sourceFile);
  pageClass.remove();
  pruneUnusedLocals(sourceFile, usedLocals);
  pruneUnusedImports(sourceFile, usedImports);
  if (holdsOnlyImports(sourceFile)) {
    for (const importer of importers) {
      transaction.track(importer.getSourceFile());
      importer.remove();
    }
    transaction.trackDelete(sourceFile);
  }
  for (const { resource, methods } of bindings) {
    for (const method of methods) {
      dropOrphanedModelMethod(resource, method, transaction);
    }
  }
  return commit(transaction, undefined);
}

/** The model methods each of the page's query routes calls, by resource. */
function queryBindings(
  pageClass: ClassDeclaration,
): Array<{ resource: string; methods: string[] }> {
  return findQueryRoutes(pageClass).flatMap((route) => {
    const binding = routeModelBinding(route.method);
    return binding ? [binding] : [];
  });
}
