const { readFileSync } = require("node:fs");
const ts = require("typescript");
const {
  vue: { parse, compileTemplate },
  css,
} = require("./frontend-tools.cjs");
const { failures } = require("./aliases-context.cjs");
const { fallbackTarget, permitted } = require("./aliases-permit.cjs");
const { checkSpecifier } = require("./aliases-specifiers.cjs");
const { checkScript } = require("./aliases-scripts.cjs");

const styleNodes = new Set([
  "StyleSheet",
  "Rule",
  "SelectorList",
  "Selector",
  "ClassSelector",
  "Block",
  "Declaration",
  "Value",
  "Identifier",
  "Dimension",
  "Function",
  "Number",
  "Combinator",
  "Operator",
  "Percentage",
  "PseudoClassSelector",
  "Hash",
]);
const styleFunctions = new Set([
  "var",
  "color-mix",
  "radial-gradient",
  "linear-gradient",
]);
const vueScriptKinds = new Map([
  ["js", ts.ScriptKind.JS],
  ["jsx", ts.ScriptKind.JSX],
  ["ts", ts.ScriptKind.TS],
  ["tsx", ts.ScriptKind.TSX],
]);

/**
 * @param {import("vue/compiler-sfc").SFCStyleBlock} block
 * @param {string} path
 */
function checkStyle(block, path) {
  if (block.src !== undefined) {
    failures.push(`${path}: external playground styles are forbidden`);
    return;
  }
  try {
    if ((block.lang ?? "css") !== "css" || block.content.includes("\\"))
      throw new Error("unsupported style language or escape");
    const ast = css.parse(block.content, {
      parseCustomProperty: true,
      onParseError(error) {
        throw error;
      },
    });
    css.walk(ast, (node) => {
      if (
        !styleNodes.has(node.type) ||
        (node.type === "Function" && !styleFunctions.has(node.name)) ||
        (node.type === "PseudoClassSelector" && node.name !== "hover")
      )
        throw new Error(`unsupported style node ${node.type}`);
    });
  } catch {
    failures.push(`${path}: unsupported playground inline style`);
  }
}

/** @param {string} path */
function checkVue(path) {
  const { descriptor, errors } = parse(readFileSync(path, "utf8"), {
    filename: path,
  });
  if (errors.length) throw new Error(`${path}: ${errors.join("; ")}`);
  for (const block of descriptor.customBlocks)
    failures.push(
      `${path}: playground custom block ${block.type} is forbidden`,
    );
  for (const block of descriptor.styles) checkStyle(block, path);
  for (const block of [descriptor.script, descriptor.scriptSetup]) {
    if (!block) continue;
    if (block.src !== undefined) {
      failures.push(`${path}: external playground scripts are forbidden`);
      continue;
    }
    const kind = vueScriptKinds.get(block.lang ?? "js");
    if (kind === undefined) {
      failures.push(
        `${path}: unsupported playground script language ${block.lang}`,
      );
      continue;
    }
    checkScript(block.content, path, kind);
  }
  const template = descriptor.template;
  if (!template) return;
  let filename = path;
  let source = template.content;
  if (template.src !== undefined) {
    checkSpecifier(template.src, path, false);
    if (!permitted(template.src, path, false)) return;
    filename = fallbackTarget(template.src, path);
    if (!filename) {
      failures.push(`${path}: unsupported playground template source`);
      return;
    }
    source = readFileSync(filename, "utf8");
  }
  const compiled = compileTemplate({
    source,
    filename,
    id: path,
    preprocessLang: template.lang,
    compilerOptions: { expressionPlugins: ["typescript"] },
  });
  if (compiled.errors.length)
    throw new Error(`${path}: ${compiled.errors.join("; ")}`);
  checkScript(compiled.code, filename, ts.ScriptKind.TS);
}

module.exports = { checkVue };
