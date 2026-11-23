/**
 * Sidebar sections: the categories the sidebar draws as a header over their
 * pages, written with `RootCategory` beside the built-in Pages, and the
 * switch between such a section and a category folded under Pages.
 *
 * @packageDocumentation
 */

import type {
  CategoryRef,
  CreateCategoryInput,
  OpResult,
} from "@antelopejs/interface-dms-builder";
import type {
  CallExpression,
  ObjectLiteralExpression,
  SourceFile,
} from "ts-morph";
import { ensureNamedImport } from "./emit";
import { getCalleeName } from "./literals";
import { duplicate, invalidConfig, unsupported } from "./ops";
import { type CategoryRecord, DMS_PAGE_MODULE, SECTION_FACTORY } from "./scan";
import { findCategoryRecord } from "./source-index";

const CATEGORY_FACTORY = "Category";
const PAGES_SECTION = "pages";
const PAGES_SECTION_IMPORT = "pagesCategory";
const BUILT_IN_SECTIONS = new Set([PAGES_SECTION, "modules", "settings"]);

/** The ref a section gets: its name, since it has no parent. */
export function sectionRefOf(
  input: Pick<CreateCategoryInput, "name" | "parent">,
): OpResult<never> | { ref: CategoryRef } {
  if (input.parent !== undefined) {
    return invalidConfig(
      `a section sits at the top of the sidebar, beside Pages: leave parent out, or create a category under "${input.parent}" without section`,
    );
  }
  if (BUILT_IN_SECTIONS.has(input.name)) {
    return invalidConfig(
      `"${input.name}" names a built-in section of the sidebar: choose another name`,
    );
  }
  return { ref: input.name };
}

/** Where a category's declaration sits in the menu: under a parent, or at the top as a section. */
export type CategoryPlacement =
  | { section: true }
  | { section: false; parentName: string; parentSpecifier: string };

/** The `Category(...)` or `RootCategory(...)` file declaring `input` at `placement`. */
export function categoryDeclaration(
  input: Pick<CreateCategoryInput, "name" | "displayName" | "icon" | "order">,
  placement: CategoryPlacement,
  indent: string,
  importStatement: (names: string[], specifier: string) => string,
): string {
  const factory = placement.section ? SECTION_FACTORY : CATEGORY_FACTORY;
  const imports = new Map<string, Set<string>>([
    [DMS_PAGE_MODULE, new Set([factory])],
  ]);
  const options = [`displayName: ${JSON.stringify(input.displayName)}`];
  if (!placement.section) {
    const names = imports.get(placement.parentSpecifier) ?? new Set<string>();
    names.add(placement.parentName);
    imports.set(placement.parentSpecifier, names);
    options.push(`category: ${placement.parentName}`);
  }
  if (input.icon) {
    options.push(`icon: ${JSON.stringify(input.icon)}`);
  }
  if (input.order !== undefined) {
    options.push(`order: ${input.order}`);
  }
  const constName = `${input.name.replace(/[^A-Za-z0-9]/g, "")}Category`;
  const importText = [...imports]
    .map(([specifier, names]) => importStatement([...names], specifier))
    .join("\n");
  const optionsText = options.map((option) => `${indent}${option},`).join("\n");
  return `${importText}\n\nexport const ${constName} = ${factory}(${JSON.stringify(input.name)}, {\n${optionsText}\n});\n`;
}

/** A category's declaration, opened for a switch between section and category. */
export interface OpenedDeclaration {
  sourceFile: SourceFile;
  call: CallExpression;
  options: ObjectLiteralExpression;
}

/** The refusal of switching `category` to `section`, or the ref it takes once switched. */
export function switchedRef(
  category: CategoryRecord,
  call: CallExpression,
  section: boolean,
): OpResult<never> | { ref: CategoryRef } {
  const factory = getCalleeName(call);
  const ref = section ? category.id : `${PAGES_SECTION}.${category.id}`;
  if (
    section &&
    (factory !== CATEGORY_FACTORY || category.parentRef !== PAGES_SECTION)
  ) {
    return unsupported(
      `only a category declared with Category directly under Pages becomes a section, so its routes stay; "${category.ref}" is not one`,
    );
  }
  if (!section && factory !== SECTION_FACTORY) {
    return unsupported(
      `only a section declared with RootCategory becomes a category under Pages; "${category.ref}" is not one`,
    );
  }
  if (findCategoryRecord(ref)) {
    return duplicate(category.id, "category");
  }
  return { ref };
}

function removeOption(options: ObjectLiteralExpression, name: string): void {
  options.getProperty(name)?.remove();
}

/**
 * Rewrites the declaration as a section, `RootCategory` without a parent, or
 * as a category under Pages, `Category` with `category: pagesCategory`. The
 * route stays: Pages adds nothing to its pages' routes. Imports the switch
 * leaves unused are the caller's to prune.
 */
export function switchSection(
  opened: OpenedDeclaration,
  section: boolean,
): void {
  const { sourceFile, call, options } = opened;
  removeOption(options, "type");
  if (section) {
    removeOption(options, "category");
    ensureNamedImport(sourceFile, SECTION_FACTORY, DMS_PAGE_MODULE);
    call.getExpression().replaceWithText(SECTION_FACTORY);
    return;
  }
  ensureNamedImport(sourceFile, CATEGORY_FACTORY, DMS_PAGE_MODULE);
  ensureNamedImport(sourceFile, PAGES_SECTION_IMPORT, DMS_PAGE_MODULE);
  call.getExpression().replaceWithText(CATEGORY_FACTORY);
  const properties = options.getProperties();
  const displayName = options.getProperty("displayName");
  options.insertPropertyAssignment(
    displayName ? properties.indexOf(displayName) + 1 : 0,
    { name: "category", initializer: PAGES_SECTION_IMPORT },
  );
}
