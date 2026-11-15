import {
  readdirSync,
  readFileSync,
  realpathSync,
  existsSync,
  statSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PRESENTER = fileURLToPath(
  new URL(
    "../layers/dms-core/app/composables/useApiErrorPresenter.ts",
    import.meta.url,
  ),
);
const SKIP = new Set(["node_modules", "dist", "tests", "test", "fixtures"]);

/** @typedef {typeof import("typescript")} TypeScript */
/** @typedef {import("typescript").Node} TsNode */
/** @typedef {import("typescript").Expression} TsExpression */
/** @typedef {import("typescript").SourceFile} TsSourceFile */
/** @typedef {import("../../checks/api-error-presentation.mjs").ApiErrorScript} ApiErrorScript */
/** @typedef {import("../../checks/api-error-presentation.mjs").ApiErrorToastCall} ApiErrorToastCall */
/** @typedef {import("../../checks/api-error-presentation.mjs").SfcParser} SfcParser */

/**
 * @typedef {object} DestructuredBinding
 * @property {string} binding
 * @property {TsExpression} owner
 */

/** @typedef {Map<string, TsExpression | DestructuredBinding>} Bindings */

/**
 * @typedef {object} Scope
 * @property {TypeScript} ts
 * @property {TsSourceFile} tree
 * @property {Bindings} bindings
 */

/**
 * @typedef {object} Dependencies
 * @property {TypeScript} ts
 * @property {SfcParser["parse"]} parse
 */

/**
 * @typedef {((id: "typescript") => TypeScript) & ((id: "vue/compiler-sfc") => typeof import("vue/compiler-sfc"))} DependencyLoader
 */

/** @type {(from: string) => DependencyLoader} */
const requireFrom = createRequire;

/**
 * @param {string} root
 * @returns {Dependencies}
 */
function dependencies(root) {
  let directory = resolve(root);
  if (!statSync(directory).isDirectory()) directory = dirname(directory);
  while (!existsSync(join(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`No package.json above ${root}`);
    directory = parent;
  }
  try {
    const require = requireFrom(join(directory, "package.json"));
    return {
      ts: require("typescript"),
      parse: require("vue/compiler-sfc").parse,
    };
  } catch (error) {
    throw new Error(
      `Install typescript and vue in ${directory} to check API error presentation`,
      { cause: error },
    );
  }
}

/**
 * Runtime sources only. Test fixtures and generated directories are excluded.
 * @param {string} root
 * @returns {string[]}
 */
export function apiErrorSources(root) {
  if (!statSync(root).isDirectory()) return [resolve(root)];
  return readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".") || SKIP.has(entry.name)) return [];
    const path = join(root, entry.name);
    if (entry.isDirectory()) return apiErrorSources(path);
    return /\.(?:vue|[cm]?tsx?)$/.test(entry.name) &&
      !/\.(?:test|spec|d)\.ts$/.test(entry.name)
      ? [resolve(path)]
      : [];
  });
}

/**
 * Parses both Vue script blocks without treating template text as JavaScript.
 * @param {string} file
 * @param {string} source
 * @param {SfcParser} tools
 * @returns {ApiErrorScript[]}
 */
export function apiErrorScripts(file, source, tools) {
  if (!file.endsWith(".vue")) return [{ source, offset: 0 }];
  const { descriptor, errors } = tools.parse(source, { filename: file });
  if (errors.length)
    throw new Error(`Cannot parse ${file}: ${errors.join(", ")}`);
  return [descriptor.script, descriptor.scriptSetup]
    .filter((block) => block !== null)
    .map((block) => ({
      source: block.content,
      offset: block.loc.start.offset,
      isSetup: block === descriptor.scriptSetup,
    }));
}

/**
 * @param {TsSourceFile} tree
 * @param {TypeScript} ts
 * @returns {Bindings}
 */
function bindingsOf(tree, ts) {
  /** @type {Bindings} */
  const bindings = new Map();
  /** @param {TsNode} node */
  const visit = (node) => {
    if (ts.isVariableDeclaration(node) && node.initializer) {
      if (ts.isIdentifier(node.name))
        bindings.set(node.name.text, node.initializer);
      if (ts.isObjectBindingPattern(node.name)) {
        for (const item of node.name.elements) {
          if (ts.isIdentifier(item.name))
            bindings.set(item.name.text, {
              binding: item.propertyName?.getText(tree) ?? item.name.text,
              owner: node.initializer,
            });
        }
      }
    }
    ts.forEachChild(node, visit);
  };
  visit(tree);
  return bindings;
}

/**
 * @param {TypeScript} ts
 * @param {TsNode | undefined} node
 * @returns {TsNode | undefined}
 */
function unwrap(ts, node) {
  while (
    node &&
    (ts.isParenthesizedExpression(node) ||
      ts.isAsExpression(node) ||
      ts.isSatisfiesExpression(node) ||
      ts.isNonNullExpression(node))
  )
    node = node.expression;
  return node;
}

/**
 * @param {Scope} scope
 * @param {TsNode | undefined} node
 * @param {Set<string>} [seen]
 * @returns {TsNode | undefined}
 */
function resolveBinding(scope, node, seen = new Set()) {
  const { ts, bindings } = scope;
  node = unwrap(ts, node);
  if (
    node &&
    ts.isIdentifier(node) &&
    bindings.has(node.text) &&
    !seen.has(node.text)
  ) {
    seen.add(node.text);
    const next = bindings.get(node.text);
    if (next && !("binding" in next)) return resolveBinding(scope, next, seen);
  }
  return node;
}

/**
 * @param {Scope} scope
 * @param {TsNode | undefined} node
 * @returns {boolean}
 */
function isToast(scope, node) {
  const { ts, tree } = scope;
  node = resolveBinding(scope, node);
  return Boolean(
    node &&
      ((ts.isIdentifier(node) && node.text === "toast") ||
        (ts.isCallExpression(node) &&
          node.expression.getText(tree) === "useToast")),
  );
}

/**
 * @param {string} name
 * @returns {name is "add" | "update"}
 */
function isToastMethod(name) {
  return name === "add" || name === "update";
}

/**
 * @param {Scope} scope
 * @param {import("typescript").CallExpression} call
 * @returns {"add" | "update" | null}
 */
function methodOf(scope, call) {
  const { ts, bindings } = scope;
  const expression = unwrap(ts, call.expression);
  if (
    expression &&
    ts.isPropertyAccessExpression(expression) &&
    isToast(scope, expression.expression) &&
    isToastMethod(expression.name.text)
  )
    return expression.name.text;
  if (expression && ts.isIdentifier(expression)) {
    const binding = bindings.get(expression.text);
    if (
      binding &&
      "binding" in binding &&
      isToast(scope, binding.owner) &&
      isToastMethod(binding.binding)
    )
      return binding.binding;
  }
  return null;
}

/**
 * @param {Scope} scope
 * @param {TsNode | undefined} payload
 * @returns {string}
 */
function colorOf(scope, payload) {
  const { ts, tree } = scope;
  payload = resolveBinding(scope, payload);
  if (!payload || !ts.isObjectLiteralExpression(payload)) return "dynamic";
  if (payload.properties.some(ts.isSpreadAssignment)) return "dynamic";
  const color = payload.properties.find(
    (property) => property.name?.getText(tree).replace(/["']/g, "") === "color",
  );
  if (!color) return "neutral";
  const value = resolveBinding(
    scope,
    ts.isPropertyAssignment(color) ? color.initializer : undefined,
  );
  if (!value) return "dynamic";
  if (ts.isStringLiteral(value)) return value.text;
  if (
    ts.isPropertyAccessExpression(value) &&
    value.expression.getText(tree) === "Color"
  )
    return value.name.text;
  return "dynamic";
}

/**
 * @param {Scope} scope
 * @param {TsNode} node
 * @param {string | null} failure
 * @param {ApiErrorToastCall[]} calls
 */
function collectToastCalls(scope, node, failure, calls) {
  const { ts, tree } = scope;
  if (ts.isCatchClause(node)) {
    collectToastCalls(
      scope,
      node.block,
      node.variableDeclaration?.name.getText(tree) ?? "",
      calls,
    );
    return;
  }
  if (ts.isCallExpression(node)) {
    const method = methodOf(scope, node);
    if (method) {
      const payload = node.arguments[method === "update" ? 1 : 0];
      const color = colorOf(scope, payload);
      if (color === "error" || (failure !== null && color !== "success"))
        calls.push({ node, payload, method, failure, color, tree });
    }
    const expression = unwrap(ts, node.expression);
    if (
      expression &&
      ts.isPropertyAccessExpression(expression) &&
      ["catch", "then"].includes(expression.name.text)
    ) {
      const rejectionIndex = expression.name.text === "catch" ? 0 : 1;
      collectToastCalls(scope, expression, failure, calls);
      node.arguments.forEach((argument, index) => {
        const rejected =
          index === rejectionIndex &&
          (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
        collectToastCalls(
          scope,
          argument,
          rejected
            ? (argument.parameters[0]?.name.getText(tree) ?? "")
            : failure,
          calls,
        );
      });
      return;
    }
  }
  ts.forEachChild(node, (child) =>
    collectToastCalls(scope, child, failure, calls),
  );
}

/**
 * Analyzes local toast bindings and failure regions. Cross-file effects are not inferred.
 * @param {string} source
 * @param {string} file
 * @param {TypeScript} ts
 * @returns {ApiErrorToastCall[]}
 */
export function analyzeApiErrorScript(source, file, ts) {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  /** @type {ApiErrorToastCall[]} */
  const calls = [];
  collectToastCalls(
    { ts, tree, bindings: bindingsOf(tree, ts) },
    tree,
    null,
    calls,
  );
  return calls;
}

/**
 * Returns diagnostics for local failure toasts outside the canonical presenter.
 * @param {string[]} roots
 * @returns {string[]}
 */
export function checkApiErrorPresentation(roots) {
  return roots.flatMap((root) => {
    const tools = dependencies(root);
    return apiErrorSources(resolve(root)).flatMap((file) => {
      if (file === PRESENTER) return [];
      const source = readFileSync(file, "utf8");
      return apiErrorScripts(file, source, tools).flatMap((script) =>
        analyzeApiErrorScript(script.source, file, tools.ts).map(({ node }) => {
          const offset = script.offset + node.getStart();
          const line = source.slice(0, offset).split("\n").length;
          return `${file}:${line}: Use useApiErrorPresenter().presentError(error, { fallbackKey })`;
        }),
      );
    });
  });
}

/**
 * Runs the checker with development dependencies resolved from each frontend root.
 * @param {string[]} roots
 */
export function assertApiErrorPresentation(roots) {
  const diagnostics = checkApiErrorPresentation(roots);
  if (diagnostics.length) throw new Error(diagnostics.join("\n"));
}

if (
  process.argv[1] &&
  realpathSync(process.argv[1]) === realpathSync(fileURLToPath(import.meta.url))
) {
  const roots = process.argv.slice(2);
  if (!roots.length)
    throw new Error("Pass frontend app or layers directories to check");
  assertApiErrorPresentation(roots);
}
