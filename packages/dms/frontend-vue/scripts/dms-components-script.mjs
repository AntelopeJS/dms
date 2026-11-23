import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * @typedef {import("typescript").Node} Node
 * @typedef {typeof import("typescript")} TypeScript
 * @typedef {"vue" | "builder" | "componentName" | "registerComponent" | "registerLayout"} UseKind
 * @typedef {{ kind: UseKind, node: Node | undefined, unprefixed?: boolean }} NamedString
 * @typedef {{ kind: UseKind, name: string, unprefixed?: boolean, offset: number }} ScriptString
 */

/**
 * @param {string} file
 * @param {string} source
 * @param {TypeScript} ts
 * @returns {import("typescript").SourceFile} The parsed source file.
 */
export function parseScript(file, source, ts) {
  return ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
}

/**
 * @param {Node} node
 * @param {TypeScript} ts
 * @returns {Node} `node` without its parentheses and assertions.
 */
function unwrap(node, ts) {
  /** @type {Node} */
  let inner = node;
  while (
    ts.isParenthesizedExpression(inner) ||
    ts.isAsExpression(inner) ||
    ts.isSatisfiesExpression(inner) ||
    ts.isNonNullExpression(inner) ||
    ts.isTypeAssertionExpression(inner)
  )
    inner = inner.expression;
  return inner;
}

/**
 * @param {Node} node
 * @param {TypeScript} ts
 * @returns {string | undefined} The text of a string literal node, or `undefined` for any other node.
 */
function literalText(node, ts) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)
    ? node.text
    : undefined;
}

/**
 * @param {import("typescript").BindingName} name
 * @param {TypeScript} ts
 * @returns {string[]} The names `name` binds.
 */
function bindingNames(name, ts) {
  if (ts.isIdentifier(name)) return [name.text];
  return name.elements.flatMap((element) =>
    ts.isOmittedExpression(element) ? [] : bindingNames(element.name, ts),
  );
}

/**
 * The name a statement other than an import declares, when it declares one.
 *
 * @param {import("typescript").Statement} statement
 * @param {TypeScript} ts
 * @returns {Node | undefined} The name node the statement declares, or `undefined` when it declares none.
 */
function declaredName(statement, ts) {
  return ts.isFunctionDeclaration(statement) ||
    ts.isClassDeclaration(statement) ||
    ts.isInterfaceDeclaration(statement) ||
    ts.isTypeAliasDeclaration(statement) ||
    ts.isEnumDeclaration(statement) ||
    ts.isModuleDeclaration(statement) ||
    ts.isImportEqualsDeclaration(statement) ||
    ts.isNamespaceExportDeclaration(statement)
    ? statement.name
    : undefined;
}

/**
 * The names an import declaration binds, the default import and the named ones.
 *
 * @param {import("typescript").ImportDeclaration} statement
 * @param {TypeScript} ts
 * @returns {(Node | undefined)[]} The name nodes the declaration imports.
 */
function importedNames(statement, ts) {
  const bindings = statement.importClause?.namedBindings;
  return [
    statement.importClause?.name,
    ...(bindings && ts.isNamedImports(bindings)
      ? bindings.elements.map((element) => element.name)
      : []),
  ];
}

/**
 * What the statements of one scope declare under `name`: the text of a
 * `const` holding a string, `{}` for any other declaration, or nothing.
 *
 * @param {readonly import("typescript").Statement[]} statements
 * @param {string} name
 * @param {TypeScript} ts
 * @returns {{ text?: string } | undefined} The declaration of `name`, or `undefined` when the statements do not declare it.
 */
function declaredIn(statements, name, ts) {
  for (const statement of statements) {
    if (ts.isVariableStatement(statement))
      for (const declaration of statement.declarationList.declarations) {
        if (!bindingNames(declaration.name, ts).includes(name)) continue;
        const constant =
          statement.declarationList.flags & ts.NodeFlags.Const &&
          ts.isIdentifier(declaration.name) &&
          declaration.initializer;
        return {
          text: constant ? literalText(unwrap(constant, ts), ts) : undefined,
        };
      }
    const imported = ts.isImportDeclaration(statement)
      ? importedNames(statement, ts)
      : [declaredName(statement, ts)];
    if (imported.some((binding) => nameOf(binding, ts) === name)) return {};
  }
  return undefined;
}

/**
 * @param {Node} scope
 * @param {string} name
 * @param {TypeScript} ts
 * @returns {boolean} Whether `scope` binds `name` as a parameter, a loop variable or a catch variable.
 */
function shadows(scope, name, ts) {
  const loop =
    (ts.isForStatement(scope) ||
      ts.isForOfStatement(scope) ||
      ts.isForInStatement(scope)) &&
    scope.initializer &&
    ts.isVariableDeclarationList(scope.initializer);
  const declarations = [
    ...(ts.isFunctionLike(scope) ? scope.parameters : []),
    ...(loop ? scope.initializer.declarations : []),
    ...(ts.isCatchClause(scope) && scope.variableDeclaration
      ? [scope.variableDeclaration]
      : []),
  ];
  return declarations.some((declaration) =>
    bindingNames(declaration.name, ts).includes(name),
  );
}

/**
 * The string the `const` that `identifier` refers to holds, when the nearest declaration of its name is one.
 *
 * @param {import("typescript").Identifier} identifier
 * @param {TypeScript} ts
 * @returns {string | undefined} The string the constant holds, or `undefined` when the declaration is not a string constant.
 */
function constantFor(identifier, ts) {
  for (let scope = identifier.parent; scope; scope = scope.parent) {
    if (shadows(scope, identifier.text, ts)) return undefined;
    if (
      ts.isBlock(scope) ||
      ts.isSourceFile(scope) ||
      ts.isModuleBlock(scope)
    ) {
      const declared = declaredIn(scope.statements, identifier.text, ts);
      if (declared) return declared.text;
    }
  }
  return undefined;
}

/**
 * A string literal, or a `const` of the same file in scope holding one.
 *
 * @param {Node | undefined} node
 * @param {TypeScript} ts
 * @returns {string | undefined} The string `node` holds, or `undefined` when it holds none.
 */
function stringOf(node, ts) {
  if (!node) return undefined;
  const value = unwrap(node, ts);
  return ts.isIdentifier(value)
    ? constantFor(value, ts)
    : literalText(value, ts);
}

/**
 * @param {Node | undefined} node
 * @param {TypeScript} ts
 * @returns {string | undefined} The name `node` spells, or `undefined` when it spells none.
 */
function nameOf(node, ts) {
  if (!node) return undefined;
  if (ts.isIdentifier(node) || ts.isStringLiteral(node)) return node.text;
  if (ts.isPropertyAccessExpression(node)) return node.name.text;
  return undefined;
}

/**
 * @param {import("typescript").ObjectLiteralExpression} object
 * @param {TypeScript} ts
 * @returns {boolean} Whether `object` has the `key` and `variant` properties of a layout banner.
 */
function isBanner(object, ts) {
  const keys = new Set(object.properties.map((p) => nameOf(p.name, ts)));
  return keys.has("key") && keys.has("variant");
}

/**
 * What a node names by string: a component Vue resolves (`resolveComponent`),
 * one an interface-dms builder takes (`CustomComponent`, `new
 * ComponentBuilder`, a `componentName` property, a layout banner's
 * `component`), or one the layer registers.
 *
 * @param {Node} node
 * @param {TypeScript} ts
 * @returns {NamedString | undefined} The component name `node` names, or `undefined` when it names none.
 */
function namedString(node, ts) {
  const call =
    ts.isCallExpression(node) || ts.isNewExpression(node) ? node : undefined;
  const callee = call && nameOf(call.expression, ts);
  const argument = callee ? call?.arguments?.[0] : undefined;
  if (callee === "resolveComponent") return { kind: "vue", node: argument };
  if (
    callee === "CustomComponent" ||
    (callee === "ComponentBuilder" && ts.isNewExpression(node))
  )
    return { kind: "builder", node: argument };
  if (callee === "registerComponent" || callee === "registerLayout")
    return { kind: callee, node: argument, unprefixed: unprefixed(call, ts) };
  if (ts.isShorthandPropertyAssignment(node))
    return nameOf(node.name, ts) === "componentName"
      ? { kind: "componentName", node: node.name }
      : undefined;
  if (!ts.isPropertyAssignment(node)) return undefined;
  const property = nameOf(node.name, ts);
  if (property === "componentName")
    return { kind: "componentName", node: node.initializer };
  return property === "component" && isBanner(node.parent, ts)
    ? { kind: "builder", node: node.initializer }
    : undefined;
}

/**
 * Whether a `registerComponent` call passes `{ prefix: false }`.
 *
 * @param {import("typescript").CallExpression | import("typescript").NewExpression | undefined} call
 * @param {TypeScript} ts
 * @returns {boolean} Whether the call passes `{ prefix: false }`.
 */
function unprefixed(call, ts) {
  const options = call?.arguments?.[2];
  return Boolean(
    options &&
      ts.isObjectLiteralExpression(options) &&
      options.properties.some(
        (property) =>
          ts.isPropertyAssignment(property) &&
          nameOf(property.name, ts) === "prefix" &&
          property.initializer.kind === ts.SyntaxKind.FalseKeyword,
      ),
  );
}

/**
 * The component names a script names by string, with the offset of each.
 *
 * @param {import("typescript").SourceFile} tree
 * @param {TypeScript} ts
 * @returns {ScriptString[]} The component names the script names, each with its offset.
 */
export function scriptStrings(tree, ts) {
  /** @type {ScriptString[]} */
  const found = [];
  /** @param {Node} node */
  const visit = (node) => {
    const named = namedString(node, ts);
    const name = named && stringOf(named.node, ts);
    if (named?.node && name)
      found.push({
        kind: named.kind,
        name,
        unprefixed: named.unprefixed,
        offset: named.node.getStart(tree),
      });
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return found;
}

/**
 * The names a script declares at its top level, which its template may use as tags.
 *
 * @param {import("typescript").SourceFile} tree
 * @param {TypeScript} ts
 * @returns {string[]} The top-level names of the script.
 */
export function scriptBindings(tree, ts) {
  return tree.statements.flatMap((statement) => {
    if (ts.isImportDeclaration(statement)) {
      const clause = statement.importClause;
      if (!clause || clause.isTypeOnly) return [];
      const named = clause.namedBindings;
      return [
        ...(clause.name ? [clause.name.text] : []),
        ...(named && ts.isNamedImports(named)
          ? named.elements
              .filter((element) => !element.isTypeOnly)
              .map((element) => element.name.text)
          : []),
      ];
    }
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap((declaration) =>
        bindingNames(declaration.name, ts),
      );
    return (ts.isFunctionDeclaration(statement) ||
      ts.isClassDeclaration(statement)) &&
      statement.name
      ? [statement.name.text]
      : [];
  });
}

/**
 * The `componentPrefix` of the layer's `dms.frontend.ts`: the first one
 * written as a string, or as a `const` of that file holding one.
 *
 * @param {string} layer
 * @param {TypeScript} ts
 * @returns {string} The prefix `dms.frontend.ts` declares.
 */
export function layerPrefix(layer, ts) {
  const entry = join(layer, "dms.frontend.ts");
  if (!existsSync(entry)) return "";
  const tree = parseScript(entry, readFileSync(entry, "utf8"), ts);
  /** @type {(string | undefined)[]} */
  const declared = [];
  /** @param {Node} node */
  const visit = (node) => {
    if (
      (ts.isPropertyAssignment(node) ||
        ts.isShorthandPropertyAssignment(node)) &&
      nameOf(node.name, ts) === "componentPrefix"
    )
      declared.push(
        stringOf(
          ts.isPropertyAssignment(node) ? node.initializer : node.name,
          ts,
        ),
      );
    ts.forEachChild(node, visit);
  };
  visit(tree);
  const prefix = declared.find((value) => value !== undefined);
  if (declared.length && prefix === undefined)
    throw new Error(
      `${entry}: write componentPrefix as a string, or a const of that file holding one, so that the DMS component check reads it`,
    );
  return prefix ?? "";
}
