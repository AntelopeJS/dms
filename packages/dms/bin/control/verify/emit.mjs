import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { extname, join } from "node:path";
import { PACKAGE_ROOT } from "../stack.mjs";

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

function fileAt(repo, sha, path) {
  const shown = spawnSync("git", ["show", `${sha}:${path}`], {
    cwd: repo,
    encoding: "utf8",
    maxBuffer: OUTPUT_LIMIT,
  });
  return shown.status === 0 ? shown.stdout : null;
}

function leafOf(ts, node) {
  if (ts.isIdentifier(node) || ts.isPrivateIdentifier(node)) return node.text;
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
 * @param {any} ts The TypeScript module
 * @param {any} node A node of the emitted JavaScript
 * @returns {string} The structure
 */
function structureOf(ts, node) {
  if (ts.isParenthesizedExpression(node))
    return structureOf(ts, node.expression);
  const children = [];
  ts.forEachChild(node, (child) => {
    if (!dropped(ts, child)) children.push(structureOf(ts, child));
  });
  return `${ts.SyntaxKind[node.kind]}(${leafOf(ts, node)}|${children.join(",")})`;
}

function emitted(ts, path, source) {
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      experimentalDecorators: true,
    },
  });
  return ts.createSourceFile(
    "emit.js",
    outputText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
}

function readable(text) {
  const flat = text.replace(/\s+/g, " ").trim();
  return flat.length > TEXT_LENGTH ? `${flat.slice(0, TEXT_LENGTH)}…` : flat;
}

function scriptItems(ts, path, source) {
  const file = emitted(ts, path, source);
  return file.statements
    .filter(
      (statement) =>
        !ts.isImportDeclaration(statement) &&
        !ts.isExportDeclaration(statement),
    )
    .map((statement) => ({
      structure: structureOf(ts, statement),
      text: readable(statement.getText(file)),
      hoisted: ts.isFunctionDeclaration(statement) && Boolean(statement.body),
    }));
}

function vueItems(ts, path, source) {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const template = /<template\b[^>]*>([\s\S]*)<\/template>/.exec(source);
  const markup = template ? template[1].replace(/\s+/g, " ").trim() : null;
  return [
    ...scripts.flatMap(([, body]) => scriptItems(ts, `${path}.ts`, body)),
    ...(markup === null
      ? []
      : [
          {
            structure: `template(${markup})`,
            text: readable(`<template> ${markup}`),
            hoisted: false,
          },
        ]),
  ];
}

function itemsOf(ts, path, source) {
  if (path.endsWith(".vue")) return vueItems(ts, path, source);
  if (CODE_EXTENSIONS.has(extname(path))) return scriptItems(ts, path, source);
  const flat = source.replace(/\s+/g, " ").trim();
  return [{ structure: `file(${flat})`, text: readable(flat), hoisted: false }];
}

/**
 * What the covered code does at a commit, as structure rather than text:
 * each covered file's top-level statements in order, and, apart, the
 * function declarations of every covered file, which hoisting lets move
 * freely. Types, comments, formatting, imports and export keywords are left
 * out, so a type-only edit, a reformat, or moving a function declaration to
 * another covered file keeps the same fingerprint, while reordering or
 * moving any other statement changes it.
 *
 * @param {string} repo The checkout
 * @param {string} sha The commit
 * @param {string[]} files The covered files
 * @returns {{ functions: { structure: string, text: string }[], files: Record<string, { structure: string, text: string }[]> }} The fingerprint
 */
export function emitFingerprint(repo, sha, files) {
  const ts = loadTypeScript(repo);
  const fingerprint = { functions: [], files: {} };
  for (const path of files) {
    const source = fileAt(repo, sha, path);
    if (source === null) continue;
    const items = itemsOf(ts, path, source);
    fingerprint.functions.push(...items.filter((item) => item.hoisted));
    fingerprint.files[path] = items.filter((item) => !item.hoisted);
  }
  return fingerprint;
}
