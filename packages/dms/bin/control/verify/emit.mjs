import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { dirname, extname, join, posix } from "node:path";
import { PACKAGE_ROOT } from "../stack.mjs";

/** @typedef {typeof import("typescript")} TypeScript */
/** @typedef {import("typescript").Node} Node */
/** @typedef {{ modules: Set<string>, functions: Set<string> }} Covered The covered modules and function names */
/** @typedef {{ structure: string, text: string, hoisted: boolean }} Item */
/** @typedef {{ path: string, file: import("typescript").SourceFile }} Script */

const CODE_EXTENSIONS = new Set([
  ".ts",
  ".mts",
  ".cts",
  ".tsx",
  ".js",
  ".mjs",
  ".cjs",
  ".jsx",
]);
const OUTPUT_LIMIT = 64 * 1024 * 1024;
const TEXT_LENGTH = 160;

/**
 * @param {string} repo
 * @returns {TypeScript}
 */
function loadTypeScript(repo) {
  for (const folder of [repo, join(repo, "packages", "dms"), PACKAGE_ROOT]) {
    try {
      return createRequire(join(folder, "package.json"))("typescript");
    } catch {
      continue;
    }
  }
  throw new Error(
    "dms-control needs the typescript package in the repository to compare covered code",
  );
}

/**
 * @param {string} repo
 * @param {string} sha
 * @param {string} path
 * @returns {string | null}
 */
function fileAt(repo, sha, path) {
  const shown = spawnSync("git", ["show", `${sha}:${path}`], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
  });
  return shown.status === 0 ? shown.stdout : null;
}

/**
 * @param {TypeScript} ts
 * @param {Node} node
 * @param {Map<string, string>} bindings
 * @returns {string}
 */
function leafOf(ts, node, bindings) {
  if (ts.isIdentifier(node))
    return propertyName(ts, node)
      ? node.text
      : (bindings.get(node.text) ?? node.text);
  if (ts.isPrivateIdentifier(node)) return node.text;
  if (ts.isNumericLiteral(node)) return String(Number(node.text));
  if (ts.isStringLiteralLike(node) || ts.isTemplateLiteralToken(node))
    return JSON.stringify(node.text);
  if (ts.isBigIntLiteral(node) || ts.isRegularExpressionLiteral(node))
    return node.text;
  if (ts.isPrefixUnaryExpression(node) || ts.isPostfixUnaryExpression(node))
    return ts.SyntaxKind[node.operator];
  if (ts.isVariableDeclarationList(node))
    return String(node.flags & (ts.NodeFlags.Let | ts.NodeFlags.Const));
  if (ts.isMetaProperty(node)) return ts.SyntaxKind[node.keywordToken];
  return "";
}

const MODULE_EXTENSION = /\.(?:[cm]?[jt]s|[jt]sx)$/;

/**
 * @param {string} path
 * @param {string} specifier The `text` of the module specifier node. An expression that has none, such as a call, is not a string and throws here.
 * @returns {string}
 */
function moduleKey(path, specifier) {
  if (!specifier.startsWith(".")) return specifier;
  return posix.join(dirname(path), specifier).replace(MODULE_EXTENSION, "");
}

/**
 * @param {string} path
 * @returns {string}
 */
function stripExtension(path) {
  return path.replace(MODULE_EXTENSION, "");
}

/**
 * @param {TypeScript} ts
 * @param {Node} node
 * @returns {boolean}
 */
function propertyName(ts, node) {
  const parent = node.parent;
  return (
    parent !== undefined &&
    parent.name === node &&
    (ts.isPropertyAccessExpression(parent) ||
      ts.isPropertyAssignment(parent) ||
      ts.isMethodDeclaration(parent) ||
      ts.isPropertyDeclaration(parent) ||
      ts.isGetAccessor(parent) ||
      ts.isSetAccessor(parent) ||
      ts.isEnumMember(parent))
  );
}

/**
 * A binding from a covered module is its name alone when it is a function
 * declaration, which may move between covered files, and `module#name`
 * otherwise, so a variable or class of one file never reads as one of the same
 * name in another.
 *
 * @param {Covered} covered The covered modules and function names
 * @param {string} module The resolved module
 * @param {string} name The imported name
 * @returns {string} The origin
 */
function bindingOrigin(covered, module, name) {
  return covered.modules.has(module) && covered.functions.has(name)
    ? name
    : `${module}#${name}`;
}

/**
 * @param {TypeScript} ts
 * @param {import("typescript").ImportClause} clause
 * @param {string} module
 * @param {Covered} covered
 * @returns {[string, string][]}
 */
function importedBindings(ts, clause, module, covered) {
  const named = clause.namedBindings;
  /** @type {[string, string][]} */
  const bindings = [];
  if (clause.name)
    bindings.push([
      clause.name.text,
      bindingOrigin(covered, module, "default"),
    ]);
  if (named && ts.isNamespaceImport(named))
    bindings.push([named.name.text, bindingOrigin(covered, module, "*")]);
  if (named && ts.isNamedImports(named))
    for (const element of named.elements)
      bindings.push([
        element.name.text,
        bindingOrigin(
          covered,
          module,
          (element.propertyName ?? element.name).text,
        ),
      ]);
  return bindings;
}

/**
 * @param {TypeScript} ts
 * @param {import("typescript").ExportDeclaration} statement
 * @param {string} module
 * @param {Covered} covered
 * @returns {string[]}
 */
function reexportTexts(ts, statement, module, covered) {
  const exported = statement.exportClause;
  const inside = covered.modules.has(module);
  if (exported === undefined) return inside ? [] : [`export * from ${module}`];
  if (ts.isNamespaceExport(exported))
    return inside ? [] : [`export * as ${exported.name.text} from ${module}`];
  return exported.elements.flatMap((element) => {
    const origin = bindingOrigin(
      covered,
      module,
      (element.propertyName ?? element.name).text,
    );
    return origin === element.name.text
      ? []
      : [`export ${origin} as ${element.name.text}`];
  });
}

/**
 * The exports of a file that name a local or imported binding, keyed by the
 * origin of what they export. An export under its own name of a local needs no
 * entry, the same as an `export` keyword, so only a renamed local and any
 * imported binding does.
 * @param {TypeScript} ts
 * @param {import("typescript").ExportDeclaration} statement
 * @param {Map<string, string>} bindings
 * @param {Map<string, string>} locals
 * @returns {string[]}
 */
function localExportTexts(ts, statement, bindings, locals) {
  const exported = statement.exportClause;
  if (exported === undefined || !ts.isNamedExports(exported)) return [];
  return exported.elements.flatMap((element) => {
    const name = (element.propertyName ?? element.name).text;
    const imported = bindings.get(name);
    const origin = imported ?? locals.get(name) ?? name;
    const own = imported === undefined && name === element.name.text;
    return own || origin === element.name.text
      ? []
      : [`export ${origin} as ${element.name.text}`];
  });
}

/**
 * Where each value-imported binding of a file comes from: the resolved
 * module and the imported name, so an alias or a swapped specifier changes
 * what a use refers to. A binding from a covered module is its name alone
 * when it is a function declaration, so moving the declaration between
 * covered files keeps every use the same; any other binding is keyed by its
 * module. Side-effect imports keep their order in the file. Re-exports and
 * renamed or imported exports become entries keyed by the origin they export.
 *
 * @param {TypeScript} ts The TypeScript module
 * @param {string} path The file
 * @param {Covered} covered The covered modules and function names
 * @param {import("typescript").SourceFile} file The emitted source file
 * @param {Map<string, string>} locals The top-level variables and classes of the file, keyed by file and name
 * @returns {{ bindings: Map<string, string>, entries: { structure: string, text: string, hoisted: boolean }[], ordered: { structure: string, text: string, hoisted: boolean }[] }} The origins; `entries` may move freely, `ordered` keep their order in the file
 */
function originsOf(ts, path, covered, file, locals) {
  /** @type {Map<string, string>} */
  const bindings = new Map();
  /** @type {string[]} */
  const texts = [];
  /** @type {string[]} */
  const ordered = [];
  /** @type {import("typescript").ExportDeclaration[]} */
  const exports = [];
  for (const statement of file.statements) {
    if (
      !(ts.isImportDeclaration(statement) || ts.isExportDeclaration(statement))
    )
      continue;
    const specifier = statement.moduleSpecifier;
    if (specifier === undefined && ts.isExportDeclaration(statement))
      exports.push(statement);
    if (specifier === undefined) continue;
    const module = moduleKey(path, specifier.text);
    if (ts.isImportDeclaration(statement)) {
      if (statement.importClause === undefined) {
        ordered.push(`import ${module}`);
        continue;
      }
      for (const [name, origin] of importedBindings(
        ts,
        statement.importClause,
        module,
        covered,
      ))
        bindings.set(name, origin);
    } else texts.push(...reexportTexts(ts, statement, module, covered));
  }
  for (const statement of exports)
    texts.push(...localExportTexts(ts, statement, bindings, locals));
  /**
   * @param {string} text
   * @param {boolean} hoisted
   * @returns {Item}
   */
  const item = (text, hoisted) => ({ structure: text, text, hoisted });
  return {
    bindings,
    entries: texts.map((text) => item(text, true)),
    ordered: ordered.map((text) => item(text, false)),
  };
}

/**
 * @param {TypeScript} ts
 * @param {Node} node
 * @returns {boolean}
 */
function dropped(ts, node) {
  return (
    node.kind === ts.SyntaxKind.ExportKeyword ||
    node.kind === ts.SyntaxKind.DefaultKeyword
  );
}

/**
 * The structure of a node: its kind, its identifier name or literal value,
 * and its children's structure, with parentheses, positions, trivia, quote
 * style and line breaks left out, so formatting never changes it.
 *
 * @param {TypeScript} ts The TypeScript module
 * @param {Node} node A node of the emitted JavaScript
 * @param {Map<string, string>} bindings The origin of each imported binding
 * @returns {string} The structure
 */
function structureOf(ts, node, bindings) {
  if (ts.isParenthesizedExpression(node))
    return structureOf(ts, node.expression, bindings);
  /** @type {string[]} */
  const children = [];
  ts.forEachChild(node, (child) => {
    if (!dropped(ts, child)) children.push(structureOf(ts, child, bindings));
  });
  return `${ts.SyntaxKind[node.kind]}(${leafOf(ts, node, bindings)}|${children.join(",")})`;
}

/**
 * @param {TypeScript} ts
 * @param {string} path
 * @param {string} source
 * @returns {Script}
 */
function parseScript(ts, path, source) {
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      experimentalDecorators: true,
    },
  });
  return {
    path,
    file: ts.createSourceFile(
      "emit.js",
      outputText,
      ts.ScriptTarget.ES2022,
      true,
      ts.ScriptKind.JS,
    ),
  };
}

/**
 * @param {string} text
 * @returns {string}
 */
function readable(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TEXT_LENGTH ? `${flat.slice(0, TEXT_LENGTH)}…` : flat;
}

/**
 * @param {TypeScript} ts
 * @param {import("typescript").BindingName} name
 * @returns {string[]}
 */
function declaredNames(ts, name) {
  return ts.isIdentifier(name)
    ? [name.text]
    : name.elements.flatMap((element) =>
        ts.isOmittedExpression(element) ? [] : declaredNames(ts, element.name),
      );
}

/**
 * @param {TypeScript} ts
 * @param {import("typescript").Statement} statement
 * @returns {statement is import("typescript").FunctionDeclaration & { name: import("typescript").Identifier }}
 */
function isFunctionDeclaration(ts, statement) {
  return (
    ts.isFunctionDeclaration(statement) &&
    Boolean(statement.body) &&
    statement.name !== undefined
  );
}

/**
 * The top-level variables, classes and enums of a script, each keyed by its file and name: what a function moved into another file must not pick up by name.
 * @param {TypeScript} ts
 * @param {Script} script
 * @returns {Map<string, string>}
 */
function localsOf(ts, script) {
  const file = stripExtension(script.path);
  const names = script.file.statements.flatMap((statement) => {
    if (ts.isVariableStatement(statement))
      return statement.declarationList.declarations.flatMap((declaration) =>
        declaredNames(ts, declaration.name),
      );
    return (ts.isClassDeclaration(statement) ||
      ts.isEnumDeclaration(statement)) &&
      statement.name
      ? [statement.name.text]
      : [];
  });
  return new Map(names.map((name) => [name, `${file}#${name}`]));
}

/**
 * @param {TypeScript} ts
 * @param {Script} script
 * @param {Covered} covered
 * @returns {Item[]}
 */
function scriptItems(ts, script, covered) {
  const locals = localsOf(ts, script);
  const origins = originsOf(ts, script.path, covered, script.file, locals);
  const inFunctions = new Map([...locals, ...origins.bindings]);
  const statements = script.file.statements
    .filter(
      (statement) =>
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement),
    )
    .map((statement) => {
      const hoisted =
        ts.isFunctionDeclaration(statement) && Boolean(statement.body);
      return {
        structure: structureOf(
          ts,
          statement,
          hoisted ? inFunctions : origins.bindings,
        ),
        text: readable(statement.getText(script.file)),
        hoisted,
      };
    });
  return [...origins.entries, ...origins.ordered, ...statements];
}

/**
 * A covered file as its scripts and the items that are not scripts: a Vue template, or the whole text of any other file.
 * @param {TypeScript} ts
 * @param {string} path
 * @param {string} source
 */
function parsedFile(ts, path, source) {
  if (path.endsWith(".vue")) {
    const template = /<template\b[^>]*>([\s\S]*)<\/template>/.exec(source);
    const markup = template ? template[1].replace(/\s+/g, " ").trim() : null;
    return {
      path,
      scripts: [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)].map(
        ([, body]) => parseScript(ts, `${path}.ts`, body),
      ),
      others:
        markup === null
          ? []
          : [
              {
                structure: `template(${markup})`,
                text: readable(`<template> ${markup}`),
                hoisted: false,
              },
            ],
    };
  }
  if (CODE_EXTENSIONS.has(extname(path)))
    return { path, scripts: [parseScript(ts, path, source)], others: [] };
  const flat = source.replace(/\s+/g, " ").trim();
  return {
    path,
    scripts: [],
    others: [
      { structure: `file(${flat})`, text: readable(flat), hoisted: false },
    ],
  };
}

/**
 * What the covered code does at a commit, as structure rather than text:
 * each covered file's top-level statements and side-effect imports in order,
 * and, apart, the function declarations and exports keyed by origin of every
 * covered file, which hoisting lets move freely. Each use of an imported
 * binding stands for its origin (resolved module and imported name), and a
 * function declaration refers to the top-level variables and classes of its
 * own file by file and name, so retargeting an import, an alias or an export,
 * or moving a function next to a different variable of the same name, changes
 * the fingerprint. Types, comments, formatting and export keywords are left
 * out, so a type-only edit, a reformat, or moving a function declaration to
 * another covered file keeps the same fingerprint, while reordering or moving
 * any other statement changes it.
 *
 * @param {string} repo The checkout
 * @param {string} sha The commit
 * @param {string[]} files The covered files
 * @returns {{ functions: { structure: string, text: string, hoisted: boolean }[], files: Record<string, { structure: string, text: string, hoisted: boolean }[]> }} The fingerprint
 */
export function emitFingerprint(repo, sha, files) {
  const ts = loadTypeScript(repo);
  /** @type {{ functions: Item[], files: Record<string, Item[]> }} */
  const fingerprint = { functions: [], files: {} };
  const parsed = files.flatMap((path) => {
    const source = fileAt(repo, sha, path);
    return source === null ? [] : [parsedFile(ts, path, source)];
  });
  const covered = {
    modules: new Set(files.map(stripExtension)),
    functions: new Set(
      parsed.flatMap(({ scripts }) =>
        scripts.flatMap(({ file }) =>
          file.statements
            .filter((statement) => isFunctionDeclaration(ts, statement))
            .map(({ name }) => name.text),
        ),
      ),
    ),
  };
  for (const { path, scripts, others } of parsed) {
    const items = [
      ...scripts.flatMap((script) => scriptItems(ts, script, covered)),
      ...others,
    ];
    fingerprint.functions.push(...items.filter((item) => item.hoisted));
    fingerprint.files[path] = items.filter((item) => !item.hoisted);
  }
  return fingerprint;
}
