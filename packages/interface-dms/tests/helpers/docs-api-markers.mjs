import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";

const MARKER = "docsApi";

/**
 * @param {ts.Node} node
 * @returns {boolean}
 */
function isExported(node) {
  return (
    ts.canHaveModifiers(node) &&
    (ts.getModifiers(node) ?? []).some(
      (modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword,
    )
  );
}

/**
 * @param {ts.Statement} statement
 * @returns {string[]}
 */
function declaredNames(statement) {
  if (ts.isVariableStatement(statement))
    return statement.declarationList.declarations.map((declaration) =>
      declaration.name.getText(),
    );
  if (
    (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement) ||
      ts.isInterfaceDeclaration(statement) ||
      ts.isTypeAliasDeclaration(statement)) &&
    statement.name
  )
    return [statement.name.text];
  return [];
}

/**
 * @param {ts.Statement} statement
 * @returns {boolean}
 */
function isRegisteredDataType(statement) {
  return (
    ts.isClassDeclaration(statement) &&
    (ts.getDecorators(statement) ?? []).some(
      (decorator) =>
        ts.isCallExpression(decorator.expression) &&
        decorator.expression.expression.getText() === "RegisterDataType",
    )
  );
}

/**
 * The exports of a source file that a docs page has to cover: those whose
 * TSDoc carries the `@docsApi` marker, and the data types registered with
 * `@RegisterDataType`, which have to carry it.
 * @param {string} text
 * @returns {{ marked: string[], dataTypes: string[] }}
 */
export function docsApiExports(text) {
  const file = ts.createSourceFile(
    "module.ts",
    text,
    ts.ScriptTarget.Latest,
    true,
  );
  /** @type {string[]} */
  const marked = [];
  /** @type {string[]} */
  const dataTypes = [];
  for (const statement of file.statements) {
    if (!isExported(statement)) continue;
    const names = declaredNames(statement);
    if (ts.getJSDocTags(statement).some((tag) => tag.tagName.text === MARKER))
      marked.push(...names);
    if (isRegisteredDataType(statement)) dataTypes.push(...names);
  }
  return { marked, dataTypes };
}

/**
 * @param {string} directory
 * @returns {string[]}
 */
function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

/**
 * The marked exports and the registered data types of every source file under
 * `directory`.
 * @param {string} directory
 */
export function docsApiInSources(directory) {
  /** @type {Set<string>} */
  const marked = new Set();
  /** @type {Set<string>} */
  const dataTypes = new Set();
  for (const file of sourceFiles(directory)) {
    const found = docsApiExports(readFileSync(file, "utf8"));
    for (const name of found.marked) marked.add(name);
    for (const name of found.dataTypes) dataTypes.add(name);
  }
  return { marked, dataTypes };
}
