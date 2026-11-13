import path from "node:path";
import type { OpResult } from "@antelopejs/interface-dms-builder";
import {
  Node,
  type SourceFile,
  type ObjectLiteralExpression,
  type PropertyAssignment,
} from "ts-morph";
import { ensureNamedImport, relativeModule } from "./emit";
import { duplicate, notFound, unsupported } from "./ops";
import { addSortedExport } from "./placement";
import { getExtendsCall } from "./literals";
import { type CategoryRecord, type PageRecord, joinSlug } from "./scan";
import { findCategoryRecord, findPageRecord } from "./source-index";
import {
  findImporters,
  getWritableProject,
  pruneUnusedImports,
  referencedImportNames,
  Transaction,
} from "./writable";

type DeclaredCategory = CategoryRecord & {
  importName: string;
  importModule: string;
};

function isDeclaredCategory(
  category: CategoryRecord,
): category is DeclaredCategory {
  return !!category.importName && !!category.importModule;
}

export interface CategoryMove {
  target: DeclaredCategory;
  newRef: string;
  newPath?: string;
}

/** Resolve a category change before modifying the page or its registration. */
export function planCategoryMove(
  ref: string,
  page: PageRecord,
  category: string,
): CategoryMove | OpResult<never> {
  const target = findCategoryRecord(category);
  if (!target) return notFound<never>(category);
  if (!isDeclaredCategory(target)) {
    return unsupported<never>(
      `category "${category}" is built-in or not declared in source, so a page cannot reference it`,
    );
  }
  const newRef = joinSlug(target.fullSlug, page.id);
  if (newRef !== ref && findPageRecord(newRef))
    return duplicate<never>(newRef, "page");
  const wanted = pageDirectoryFor(getWritableProject(), target, page.id);
  const move: CategoryMove = { target, newRef };
  if (wanted && wanted !== page.filepath) move.newPath = wanted;
  return move;
}

/** Use the same directory convention as CreatePage, when the category has a barrel. */
function pageDirectoryFor(
  project: ReturnType<typeof getWritableProject>,
  category: CategoryRecord,
  id: string,
): string | undefined {
  if (!category.importModule?.endsWith(".ts")) return undefined;
  const categoryDir = path.dirname(category.importModule);
  if (!project.getSourceFile(path.join(categoryDir, "index.ts")))
    return undefined;
  return path.join(categoryDir, id, "page.ts");
}

/**
 * Move the page as a transactional create/delete, preserving relative imports.
 * The old category import is captured before its last reference is replaced.
 */
export function applyCategoryMove(
  project: ReturnType<typeof getWritableProject>,
  sourceFile: SourceFile,
  optionsArg: ObjectLiteralExpression,
  move: CategoryMove,
  transaction: Transaction,
): SourceFile {
  const target = move.target;
  const oldPath = sourceFile.getFilePath();
  const newPath = move.newPath ?? oldPath;
  const file =
    move.newPath === undefined
      ? sourceFile
      : project.createSourceFile(newPath, sourceFile.getFullText());
  if (move.newPath !== undefined) {
    transaction.track(file, true);
    reanchorRelativeImports(file, oldPath, newPath);
    rewireImporters(project, oldPath, newPath, transaction);
  }
  const used = referencedImportNames(file);
  const property = findCategoryProperty(file, optionsArg);
  property?.setInitializer(target.importName);
  const specifier = target.importModule.endsWith(".ts")
    ? relativeModule(newPath, target.importModule)
    : target.importModule;
  ensureNamedImport(file, target.importName, specifier);
  pruneUnusedImports(file, used);
  if (move.newPath !== undefined) transaction.trackDelete(sourceFile);
  return file;
}

function reanchorRelativeImports(
  sourceFile: SourceFile,
  fromPath: string,
  toPath: string,
): void {
  const fromDir = path.dirname(fromPath);
  for (const declaration of [
    ...sourceFile.getImportDeclarations(),
    ...sourceFile.getExportDeclarations(),
  ]) {
    const specifier = declaration.getModuleSpecifierValue();
    if (!specifier?.startsWith(".")) continue;
    declaration.setModuleSpecifier(
      relativeModule(toPath, path.resolve(fromDir, specifier)),
    );
  }
}

/** Move barrel registration; repoint direct imports rather than deleting them. */
function rewireImporters(
  project: ReturnType<typeof getWritableProject>,
  fromPath: string,
  toPath: string,
  transaction: Transaction,
): void {
  const barrelPath = path.join(path.dirname(toPath), "..", "index.ts");
  const newBarrel = project.getSourceFile(path.resolve(barrelPath));
  for (const importer of findImporters(project, fromPath)) {
    const file = importer.getSourceFile();
    transaction.track(file);
    if (
      newBarrel &&
      file !== newBarrel &&
      path.basename(file.getFilePath()) === "index.ts"
    ) {
      importer.remove();
      continue;
    }
    importer.setModuleSpecifier(relativeModule(file.getFilePath(), toPath));
  }
  if (!newBarrel) return;
  const specifier = relativeModule(newBarrel.getFilePath(), toPath);
  const listed = [
    ...newBarrel.getImportDeclarations(),
    ...newBarrel.getExportDeclarations(),
  ].some((entry) => entry.getModuleSpecifierValue() === specifier);
  if (listed) return;
  transaction.track(newBarrel);
  addSortedExport(newBarrel, specifier);
}

/** A moved page is a fresh file, so its options must be located again. */
function findCategoryProperty(
  file: SourceFile,
  original: ObjectLiteralExpression,
): PropertyAssignment | undefined {
  const options =
    file.getFilePath() === original.getSourceFile().getFilePath()
      ? original
      : findPageOptions(file);
  const property = options?.getProperty("category");
  return property && Node.isPropertyAssignment(property) ? property : undefined;
}

function findPageOptions(
  file: SourceFile,
): ObjectLiteralExpression | undefined {
  for (const cls of file.getClasses()) {
    const arg = getExtendsCall(cls)?.getArguments()[1];
    if (arg && Node.isObjectLiteralExpression(arg)) return arg;
  }
  return undefined;
}
