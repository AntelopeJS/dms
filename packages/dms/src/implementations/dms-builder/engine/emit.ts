import path from "node:path";
import type {
  ConfigObject,
  ImportRef,
} from "@antelopejs/interface-dms-builder";
import type { ImportDeclaration, SourceFile } from "ts-morph";
import { propertyKey } from "./paths";
import { indentationText, resolveProjectRoot } from "./project";
import { type EmitContext, inlineOrBlock, serializeValue } from "./value";

/** Past this, a formatter breaks an import across lines; so does the builder. */
const IMPORT_LINE_LIMIT = 80;

/**
 * An import statement written the way the project's formatter would write it:
 * on one line while it fits, one name per line once it does not. A single name
 * is never broken out, however long the line: there is nothing to gain, and
 * formatters leave it alone, so breaking it would be a change the next `format`
 * undoes.
 */
export function importStatement(
  names: string[],
  specifier: string,
  indent: string,
  typeOnly = false,
): string {
  const keyword = typeOnly ? "import type" : "import";
  const from = `from ${JSON.stringify(specifier)};`;
  const inline = `${keyword} { ${names.join(", ")} } ${from}`;
  if (names.length < 2 || inline.length <= IMPORT_LINE_LIMIT) {
    return inline;
  }
  const lines = names.map((name) => `${indent}${name},`).join("\n");
  return `${keyword} {\n${lines}\n} ${from}`;
}

/**
 * Rewrite a declaration a name was just inserted into, the way the project's
 * formatter would.
 *
 * ts-morph splices the new name into the line its neighbour sits on, which on a
 * declaration already broken across lines leaves the tail of the list and the
 * `from` clause hanging off the last name. A declaration that grew has to be
 * laid out again rather than extended in place.
 *
 * A default or namespace binding is left alone: it is not a list, and this only
 * knows how to write one.
 */
function reflowNamedImports(declaration: ImportDeclaration): void {
  if (declaration.getDefaultImport() || declaration.getNamespaceImport()) {
    return;
  }
  const names = declaration.getNamedImports().map((entry) => entry.getText());
  declaration.replaceWithText(
    importStatement(
      names,
      declaration.getModuleSpecifierValue(),
      indentationText(resolveProjectRoot()),
      declaration.isTypeOnly(),
    ),
  );
}

function importedNames(sourceFile: SourceFile): Set<string> {
  const names = new Set<string>();
  for (const decl of sourceFile.getImportDeclarations()) {
    const def = decl.getDefaultImport();
    if (def) {
      names.add(def.getText());
    }
    const namespace = decl.getNamespaceImport();
    if (namespace) {
      names.add(namespace.getText());
    }
    for (const named of decl.getNamedImports()) {
      names.add(named.getAliasNode()?.getText() ?? named.getName());
    }
  }
  return names;
}

/**
 * Add a named import unless the root name is already bound in the file, even
 * from another specifier: a second binding raises a spurious "Duplicate
 * identifier" that buries the real diagnostic when the op is otherwise invalid.
 */
export function ensureNamedImport(
  sourceFile: SourceFile,
  name: string,
  moduleSpecifier: string,
): void {
  const rootName = name.split(".")[0];
  if (importedNames(sourceFile).has(rootName)) {
    return;
  }
  const decl = sourceFile
    .getImportDeclarations()
    .find((d) => d.getModuleSpecifierValue() === moduleSpecifier);
  if (!decl) {
    insertSortedImport(sourceFile, moduleSpecifier, rootName);
    return;
  }
  insertSortedNamedImport(decl, rootName);
}

/**
 * Add a name to an existing import, alphabetically among its siblings.
 *
 * Positioned by its place among the named imports, not by the specifier's child
 * index: the latter counts the separating commas too, so it overruns as soon as
 * the import binds more than one name.
 */
function insertSortedNamedImport(
  declaration: ImportDeclaration,
  name: string,
): void {
  const at = declaration
    .getNamedImports()
    .findIndex((entry) => name < entry.getName());
  if (at === -1) {
    declaration.addNamedImport(name);
  } else {
    declaration.insertNamedImport(at, name);
  }
  reflowNamedImports(declaration);
}

/**
 * How a formatter orders imports: packages before relative paths, alphabetical
 * within each. Used to place a new one rather than append it — appending leaves
 * the file unsorted, and the next `format` reorders a file the author never
 * touched, putting a change they did not ask for in the same diff.
 */
function importRank(specifier: string): [number, string] {
  return [specifier.startsWith(".") ? 1 : 0, specifier];
}

function sortsBefore(a: string, b: string): boolean {
  const [groupA, textA] = importRank(a);
  const [groupB, textB] = importRank(b);
  return groupA !== groupB ? groupA < groupB : textA < textB;
}

function insertSortedImport(
  sourceFile: SourceFile,
  moduleSpecifier: string,
  name: string,
): void {
  const after = sourceFile
    .getImportDeclarations()
    .find((entry) =>
      sortsBefore(moduleSpecifier, entry.getModuleSpecifierValue()),
    );
  const structure = { moduleSpecifier, namedImports: [name] };
  if (!after) {
    sourceFile.addImportDeclaration(structure);
    return;
  }
  sourceFile.insertImportDeclaration(after.getChildIndex(), structure);
}

export function importSpecifier(
  sourceFile: SourceFile,
  ref: ImportRef,
): string | undefined {
  if (ref.module) {
    return ref.module;
  }
  if (!ref.targetFile || ref.targetFile === sourceFile.getFilePath()) {
    return undefined;
  }
  return relativeModule(sourceFile.getFilePath(), ref.targetFile);
}

export function applyImportRef(sourceFile: SourceFile, ref: ImportRef): void {
  const specifier = importSpecifier(sourceFile, ref);
  if (specifier === undefined) {
    return;
  }
  ensureNamedImport(sourceFile, ref.name, specifier);
}

export function relativeModule(fromFile: string, toFile: string): string {
  const rel = path
    .relative(path.dirname(fromFile), toFile)
    .replace(/\\/g, "/")
    .replace(/\.tsx?$/, "");
  return rel.startsWith(".") ? rel : `./${rel}`;
}

function objectText(config: ConfigObject, ctx: EmitContext): string {
  const entries = Object.entries(config).filter(
    ([, value]) => value !== undefined,
  );
  if (entries.length === 0) {
    return "";
  }
  return inlineOrBlock(
    entries.map(
      ([key, value]) => `${propertyKey(key)}: ${serializeValue(value, ctx)}`,
    ),
    "{",
    "}",
  );
}

export function blockCallText(
  type: string,
  config: ConfigObject,
  ctx: EmitContext,
  controllerText?: string,
): string {
  const options = objectText(config, ctx);
  if (controllerText !== undefined) {
    return options
      ? `${type}(${controllerText}, ${options})`
      : `${type}(${controllerText})`;
  }
  return `${type}(${options})`;
}

export function childArgText(
  id: string,
  valueText: string,
  ctx: EmitContext,
  slot?: string,
  meta?: ConfigObject,
): string {
  const entries = slot === undefined ? {} : { slot };
  const metaText = objectText({ ...entries, ...meta }, ctx);
  return `${JSON.stringify(id)}, ${valueText}${metaText ? `, ${metaText}` : ""}`;
}

/** The lowercase words of an identifier, split at case changes and punctuation. */
export function words(value: string): string[] {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.toLowerCase());
}

export function pascalCase(value: string): string {
  return value
    .split(/[^A-Za-z0-9]+/)
    .filter((part) => part.length > 0)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join("");
}
