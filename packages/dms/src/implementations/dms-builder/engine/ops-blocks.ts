/**
 * Deleting and reconfiguring blocks, then the page lifecycle: creation and
 * configuration. Deletion is in page-delete.ts.
 */

import fs from "node:fs";
import path from "node:path";
import type {
  CreatePageInput,
  EditablePageMeta,
  MoveDest,
  MutationOpts,
  OpResult,
  PageRef,
} from "@antelopejs/interface-dms-builder";
import { Node, type SourceFile } from "ts-morph";
import { resolveBlockTarget } from "./block-target";
import {
  applyImportRef,
  importStatement,
  pascalCase,
  relativeModule,
} from "./emit";
import { getExtendsCall, stringLiteralValue } from "./literals";
import { parseBlockPath } from "./paths";
import { indentationText, resolveProjectRoot } from "./project";
import {
  addSortedExport,
  barrelSpecifier,
  findNearestBarrel,
  resolveWithinSrc,
  srcDir,
} from "./placement";
import {
  type CategoryMove,
  applyCategoryMove,
  planCategoryMove,
} from "./page-category-move";
import { pageVersion } from "./page-structure";
import { resourceRefResolver } from "./resource-index";
import { type CategoryRecord, joinSlug } from "./scan";
import {
  findCategoryRecord,
  findPageRecord,
  invalidateSourceIndex,
} from "./source-index";
import { createImportCollector, InvalidValueError } from "./value";
import {
  findPageClass,
  getWritableProject,
  refreshFromDisk,
  resolveRootBarrel,
  Transaction,
} from "./writable";
import { applyPatch, optionsPatch } from "./options-patch";
import {
  checkVersion,
  childArgsOf,
  clampIndex,
  commit,
  duplicate,
  invalidConfig,
  moduleError,
  invalidValue,
  isError,
  notFound,
  opaque,
  openPage,
  setChildren,
  unsupported,
} from "./ops";
const DMS_PAGE_MODULE = "@antelopejs/interface-dms/page";
const DMS_LAYOUTS_MODULE = "@antelopejs/interface-dms/base/layouts";
export function removeBlock(targetPath: string, opts?: MutationOpts): OpResult {
  const parsed = parseBlockPath(targetPath);
  if (!parsed) {
    return notFound(targetPath);
  }
  const context = openPage(parsed.pageRef);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(parsed.pageRef);
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  if (parsed.segments.length === 1) {
    const prop = cls
      .getStaticProperties()
      .find(
        (candidate) =>
          Node.isPropertyDeclaration(candidate) &&
          candidate.getName() === parsed.segments[0],
      );
    if (!prop) {
      return notFound(targetPath);
    }
    prop.remove();
    return commit(transaction, undefined);
  }
  const parentSegments = parsed.segments.slice(0, -1);
  const childId = parsed.segments[parsed.segments.length - 1];
  const resolved = resolveBlockTarget(cls, parentSegments);
  if (!resolved.ok) {
    return resolved.reason === "not_found"
      ? notFound(targetPath)
      : opaque(targetPath);
  }
  const index = resolved.target.childCalls.findIndex(
    (call) => stringLiteralValue(call.getArguments()[0]) === childId,
  );
  if (index < 0) {
    return notFound(targetPath);
  }
  const args = childArgsOf(resolved.target);
  args.splice(index, 1);
  setChildren(resolved.target, args);
  return commit(transaction, undefined);
}

export function moveBlock(
  targetPath: string,
  dest: MoveDest,
  opts?: MutationOpts,
): OpResult {
  const parsed = parseBlockPath(targetPath);
  if (!parsed || parsed.segments.length < 2 || !dest.parent) {
    return unsupported(
      "moveBlock v1 supports moving a child block into a container",
    );
  }
  const context = openPage(parsed.pageRef);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(parsed.pageRef);
  }
  const sourceParentSegments = parsed.segments.slice(0, -1);
  const childId = parsed.segments[parsed.segments.length - 1];
  const source = resolveBlockTarget(cls, sourceParentSegments);
  if (!source.ok) {
    return source.reason === "not_found"
      ? notFound(targetPath)
      : opaque(targetPath);
  }
  const sourceIndex = source.target.childCalls.findIndex(
    (call) => stringLiteralValue(call.getArguments()[0]) === childId,
  );
  if (sourceIndex < 0) {
    return notFound(targetPath);
  }
  const destParsed = parseBlockPath(dest.parent);
  if (!destParsed) {
    return notFound(dest.parent);
  }
  const transaction = new Transaction(context.sourceFile.getProject());
  transaction.track(context.sourceFile);
  const args = childArgsOf(source.target);
  const [moved] = args.splice(sourceIndex, 1);
  if (destParsed.segments.join("/") === sourceParentSegments.join("/")) {
    const { index, warnings } = clampIndex(dest.index, args.length);
    args.splice(index, 0, moved);
    setChildren(source.target, args);
    return commit(transaction, undefined, warnings);
  }
  setChildren(source.target, args);
  const destResolved = resolveBlockTarget(cls, destParsed.segments);
  if (!destResolved.ok || !destResolved.target.editable) {
    transaction.rollback();
    return destResolved.ok === false && destResolved.reason === "not_found"
      ? notFound(dest.parent)
      : opaque(dest.parent);
  }
  const destArgs = childArgsOf(destResolved.target);
  const { index, warnings } = clampIndex(dest.index, destArgs.length);
  destArgs.splice(index, 0, moved);
  setChildren(destResolved.target, destArgs);
  return commit(transaction, undefined, warnings);
}

/**
 * The source of a new page file. It always names a layout: a page with no
 * layout renders bare, since the DMS has no default to fall back on, so it
 * comes up without the dashboard's sidebar, header or content container.
 * Every hand-written page passes one; a generated one must too.
 */
function buildPageSource(
  input: CreatePageInput,
  category: CategoryRecord,
  filepath: string,
): string {
  const className = `${pascalCase(input.name)}Page`;
  const options = [`displayName: ${JSON.stringify(input.displayName)}`];
  let categoryImport = "";
  if (category.moduleId) {
    options.push(`module: ${JSON.stringify(category.moduleId)}`);
  } else if (category.importName && category.importModule) {
    const spec = category.importModule.endsWith(".ts")
      ? relativeModule(filepath, category.importModule)
      : category.importModule;
    categoryImport = `import { ${category.importName} } from ${JSON.stringify(spec)};\n`;
    options.push(`category: ${category.importName}`);
  }
  if (input.icon) {
    options.push(`icon: ${JSON.stringify(input.icon)}`);
  }
  if (input.order !== undefined) {
    options.push(`order: ${input.order}`);
  }
  if (input.description) {
    options.push(`description: ${JSON.stringify(input.description)}`);
  }
  if (input.permission !== undefined) {
    options.push(`permission: ${JSON.stringify(input.permission)}`);
  }
  const indent = indentationText(resolveProjectRoot());
  const imports = [
    importStatement(
      ["PageController", "RegisterPage"],
      DMS_PAGE_MODULE,
      indent,
    ),
    importStatement(["DefaultLayout"], DMS_LAYOUTS_MODULE, indent),
  ].join("\n");
  const optionLines = options
    .map((option) => `${indent}${indent}${option},`)
    .join("\n");
  return `${imports}\n${categoryImport}\n@RegisterPage()\nexport class ${className} extends PageController(\n${indent}${JSON.stringify(input.name)},\n${indent}{\n${optionLines}\n${indent}},\n${indent}DefaultLayout({ fullWidth: true }),\n) {}\n`;
}

interface PagePlacement {
  filepath: string;
  barrel: SourceFile;
  wire: () => void;
}

function placeByDir(
  project: ReturnType<typeof getWritableProject>,
  dir: string,
  name: string,
  module?: string,
): PagePlacement | undefined {
  const src = srcDir(project, module);
  if (!src) {
    return undefined;
  }
  const resolved = resolveWithinSrc(src, dir);
  if (resolved === undefined) {
    return undefined;
  }
  const barrel = findNearestBarrel(project, resolved);
  if (!barrel) {
    return undefined;
  }
  return {
    filepath: path.join(resolved, name, "page.ts"),
    barrel,
    wire: () =>
      addSortedExport(
        barrel,
        barrelSpecifier(barrel, path.join(resolved, name, "page")),
      ),
  };
}

function resolvePagePlacement(
  project: ReturnType<typeof getWritableProject>,
  category: CategoryRecord,
  name: string,
  dir?: string,
  module?: string,
): PagePlacement | undefined {
  if (dir !== undefined) {
    return placeByDir(project, dir, name, module);
  }
  if (category.importModule?.endsWith(".ts")) {
    const categoryDir = path.dirname(category.importModule);
    const categoryBarrel = project.getSourceFile(
      path.join(categoryDir, "index.ts"),
    );
    if (categoryBarrel) {
      return {
        filepath: path.join(categoryDir, name, "page.ts"),
        barrel: categoryBarrel,
        wire: () => addSortedExport(categoryBarrel, `./${name}/page`),
      };
    }
  }
  const root = resolveRootBarrel(project, module);
  if (!root) {
    return undefined;
  }
  return {
    filepath: path.join(path.dirname(root.getFilePath()), `${name}.ts`),
    barrel: root,
    wire: () => root.addImportDeclaration({ moduleSpecifier: `./${name}` }),
  };
}

/**
 * A name that can safely be a directory, a URL segment and part of a class
 * name. It is all three at once, so a space or a slash in it produces a folder
 * that is awkward to handle and a route that has to be escaped to be linked.
 */
const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export function slugError(
  name: string,
  kind: "page" | "category",
): OpResult<never> | undefined {
  if (SLUG.test(name)) {
    return undefined;
  }
  const suggestion = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return invalidConfig<never>(
    `"${name}" cannot name a ${kind}: it becomes a folder, a route and a class name, so it must be lowercase letters, digits and dashes${suggestion ? ` — try "${suggestion}"` : ""}`,
  );
}

type PageData = { ref: PageRef; filepath: string };

export interface StagedPage {
  ref: PageRef;
  filepath: string;
  sourceFile: SourceFile;
}

/**
 * Writes a new page and wires its barrel inside a transaction the caller owns
 * and commits, so blocks can be added to it before the one typecheck.
 */
export function stagePage(
  input: CreatePageInput,
  transaction: Transaction,
): StagedPage | OpResult<PageData> {
  const invalid = slugError(input.name, "page");
  if (invalid) {
    return invalid;
  }
  const category = findCategoryRecord(input.category);
  if (!category) {
    return notFound<PageData>(input.category);
  }
  const ref = joinSlug(category.fullSlug, input.name);
  if (findPageRecord(ref)) {
    return duplicate<PageData>(input.name, "page");
  }
  const misplaced = moduleError(
    input.module,
    category.importModule,
    `category "${input.category}"`,
  );
  if (misplaced) {
    return misplaced;
  }
  const project = getWritableProject();
  refreshFromDisk(project);
  const placement = resolvePagePlacement(
    project,
    category,
    input.name,
    input.dir,
    input.module,
  );
  if (!placement) {
    return unsupported<PageData>(
      "could not resolve a barrel to register the new page",
    );
  }
  if (fs.existsSync(placement.filepath)) {
    return duplicate<PageData>(input.name, "page");
  }
  transaction.track(placement.barrel);
  const sourceFile = project.createSourceFile(
    placement.filepath,
    buildPageSource(input, category, placement.filepath),
  );
  transaction.track(sourceFile, true);
  placement.wire();
  return { ref, filepath: placement.filepath, sourceFile };
}

export function createPage(
  input: CreatePageInput,
): OpResult<{ ref: PageRef; filepath: string }> {
  const transaction = new Transaction(getWritableProject());
  const staged = stagePage(input, transaction);
  if ("ok" in staged) {
    return staged;
  }
  return commit(transaction, { ref: staged.ref, filepath: staged.filepath });
}

export function configurePage(
  ref: string,
  patch: Partial<EditablePageMeta>,
  opts?: MutationOpts,
): OpResult<{ ref: string; version: string }> {
  const context = openPage(ref);
  if (isError(context)) {
    return context;
  }
  const stale = checkVersion(context.sourceFile, opts);
  if (stale) {
    return stale;
  }
  const cls = findPageClass(context.sourceFile, context.page.id);
  if (!cls) {
    return notFound(ref);
  }
  const call = getExtendsCall(cls);
  const optionsArg = call?.getArguments()[1];
  if (!optionsArg || !Node.isObjectLiteralExpression(optionsArg)) {
    return unsupported("page options are not a plain object literal");
  }
  const { category, ...scalar } = patch;
  let move: CategoryMove | undefined;
  if (category !== undefined) {
    const planned = planCategoryMove(ref, context.page, category);
    if ("ok" in planned) {
      return planned;
    }
    move = planned;
  }
  const project = context.sourceFile.getProject();
  const transaction = new Transaction(project);
  transaction.track(context.sourceFile);
  const { ctx, imports } = createImportCollector({
    resolveRef: resourceRefResolver(),
  });
  try {
    applyPatch(optionsArg, optionsPatch(scalar), false, ctx);
  } catch (error) {
    transaction.rollback();
    if (error instanceof InvalidValueError) {
      return invalidValue(error);
    }
    throw error;
  }
  for (const importRef of imports) {
    applyImportRef(context.sourceFile, importRef);
  }
  const written = move
    ? applyCategoryMove(
        project,
        context.sourceFile,
        optionsArg,
        move,
        transaction,
      )
    : context.sourceFile;
  const newRef = move?.newRef ?? ref;
  const result = commit(transaction, {
    ref: newRef,
    version: pageVersion(written),
  });
  if (result.ok && newRef !== ref) {
    invalidateSourceIndex();
    result.warnings = [
      ...(result.warnings ?? []),
      {
        code: "route_changed",
        message: `the page's route is now "${newRef}"; it was "${ref}", and nothing redirects the old one`,
      },
    ];
  }
  return result;
}
