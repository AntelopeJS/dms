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

function dependencies(root) {
  let directory = resolve(root);
  if (!statSync(directory).isDirectory()) directory = dirname(directory);
  while (!existsSync(join(directory, "package.json"))) {
    const parent = dirname(directory);
    if (parent === directory) throw new Error(`No package.json above ${root}`);
    directory = parent;
  }
  try {
    const require = createRequire(join(directory, "package.json"));
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

/** Runtime sources only. Test fixtures and generated directories are excluded. */
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

/** Parses both Vue script blocks without treating template text as JavaScript. */
export function apiErrorScripts(file, source, tools) {
  if (!file.endsWith(".vue")) return [{ source, offset: 0 }];
  const { descriptor, errors } = tools.parse(source, { filename: file });
  if (errors.length)
    throw new Error(`Cannot parse ${file}: ${errors.join(", ")}`);
  return [descriptor.script, descriptor.scriptSetup]
    .filter(Boolean)
    .map((block) => ({
      source: block.content,
      offset: block.loc.start.offset,
      isSetup: block === descriptor.scriptSetup,
    }));
}

function bindingsOf(tree, ts) {
  const bindings = new Map();
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

/** Analyzes local toast bindings and failure regions. Cross-file effects are not inferred. */
export function analyzeApiErrorScript(source, file, ts) {
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TS,
  );
  const bindings = bindingsOf(tree, ts);
  const unwrap = (node) => {
    while (
      node &&
      (ts.isParenthesizedExpression(node) ||
        ts.isAsExpression(node) ||
        ts.isSatisfiesExpression(node) ||
        ts.isNonNullExpression(node))
    )
      node = node.expression;
    return node;
  };
  const resolveBinding = (node, seen = new Set()) => {
    node = unwrap(node);
    if (
      node &&
      ts.isIdentifier(node) &&
      bindings.has(node.text) &&
      !seen.has(node.text)
    ) {
      seen.add(node.text);
      const next = bindings.get(node.text);
      if (!next.binding) return resolveBinding(next, seen);
    }
    return node;
  };
  const isToast = (node) => {
    node = resolveBinding(node);
    return (
      node &&
      ((ts.isIdentifier(node) && node.text === "toast") ||
        (ts.isCallExpression(node) &&
          node.expression.getText(tree) === "useToast"))
    );
  };
  const methodOf = (call) => {
    const expression = unwrap(call.expression);
    if (
      ts.isPropertyAccessExpression(expression) &&
      isToast(expression.expression) &&
      ["add", "update"].includes(expression.name.text)
    )
      return expression.name.text;
    if (ts.isIdentifier(expression)) {
      const binding = bindings.get(expression.text);
      if (
        binding?.binding &&
        isToast(binding.owner) &&
        ["add", "update"].includes(binding.binding)
      )
        return binding.binding;
    }
    return null;
  };
  const colorOf = (payload) => {
    payload = resolveBinding(payload);
    if (!payload || !ts.isObjectLiteralExpression(payload)) return "dynamic";
    if (payload.properties.some(ts.isSpreadAssignment)) return "dynamic";
    const color = payload.properties.find(
      (property) =>
        property.name?.getText(tree).replace(/["']/g, "") === "color",
    );
    if (!color) return "neutral";
    const value = resolveBinding(color.initializer);
    if (!value) return "dynamic";
    if (ts.isStringLiteral(value)) return value.text;
    if (
      ts.isPropertyAccessExpression(value) &&
      value.expression.getText(tree) === "Color"
    )
      return value.name.text;
    return "dynamic";
  };
  const calls = [];
  const visit = (node, failure = null) => {
    if (ts.isCatchClause(node)) {
      visit(node.block, node.variableDeclaration?.name.getText(tree) ?? "");
      return;
    }
    if (ts.isCallExpression(node)) {
      const method = methodOf(node);
      if (method) {
        const payload = node.arguments[method === "update" ? 1 : 0];
        const color = colorOf(payload);
        if (color === "error" || (failure !== null && color !== "success"))
          calls.push({ node, payload, method, failure, color, tree });
      }
      const expression = unwrap(node.expression);
      if (
        ts.isPropertyAccessExpression(expression) &&
        ["catch", "then"].includes(expression.name.text)
      ) {
        const rejectionIndex = expression.name.text === "catch" ? 0 : 1;
        visit(expression, failure);
        node.arguments.forEach((argument, index) => {
          const rejected =
            index === rejectionIndex &&
            (ts.isArrowFunction(argument) || ts.isFunctionExpression(argument));
          visit(
            argument,
            rejected
              ? (argument.parameters[0]?.name.getText(tree) ?? "")
              : failure,
          );
        });
        return;
      }
    }
    ts.forEachChild(node, (child) => visit(child, failure));
  };
  visit(tree);
  return calls;
}

/** Returns diagnostics for local failure toasts outside the canonical presenter. */
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

/** Runs the checker with development dependencies resolved from each frontend root. */
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
