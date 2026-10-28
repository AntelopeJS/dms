import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { parse } from "vue/compiler-sfc";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const SCRIPT_EXTENSIONS = new Set([
  ".js",
  ".jsx",
  ".mjs",
  ".cjs",
  ".ts",
  ".tsx",
  ".mts",
  ".cts",
]);
const DIRECTIVE =
  /^(oxlint|eslint)-(disable|enable)(?:\s+(.*?))?\s*(?:--.*)?$/su;

/** Every comment of a script, each once, in source order. */
function commentsOf(source, file) {
  const kind = /\.[jt]sx$/u.test(file) ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const tree = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    kind,
  );
  const ranges = new Map();
  const collect = (node) => {
    for (const range of [
      ...(ts.getLeadingCommentRanges(source, node.getFullStart()) ?? []),
      ...(ts.getTrailingCommentRanges(source, node.getEnd()) ?? []),
    ])
      ranges.set(range.pos, range);
    for (const child of node.getChildren(tree)) collect(child);
  };
  collect(tree);
  return [...ranges.values()]
    .sort((left, right) => left.pos - right.pos)
    .map((range) => ({
      line: tree.getLineAndCharacterOfPosition(range.pos).line + 1,
      text: source
        .slice(range.pos, range.end)
        .replace(/^\/\/|^\/\*|\*\/$/gu, "")
        .replace(/^\s*\*?\s*/u, "")
        .trim(),
    }));
}

/** The block directives a script leaves open at its end. */
function unclosedBlocks(source, file, lineOffset) {
  const open = new Map();
  const failures = [];
  for (const { line, text } of commentsOf(source, file)) {
    const match = DIRECTIVE.exec(text);
    if (!match) continue;
    const [, tool, action, list = ""] = match;
    const rules = list.split(/[\s,]+/u).filter(Boolean);
    const at = `${file}:${line + lineOffset}`;
    if (action === "disable") {
      for (const rule of rules.length ? rules : ["*"])
        if (!open.has(`${tool} ${rule}`)) open.set(`${tool} ${rule}`, at);
    } else if (!rules.length) {
      for (const key of [...open.keys()])
        if (key.startsWith(`${tool} `)) open.delete(key);
    } else {
      for (const rule of rules)
        if (!open.delete(`${tool} ${rule}`) && !open.has(`${tool} *`))
          failures.push(
            `${at}: ${tool}-enable ${rule} closes no ${tool}-disable`,
          );
    }
  }
  for (const [key, at] of open) {
    const [tool, rule] = key.split(" ");
    const named = rule === "*" ? "" : ` ${rule}`;
    failures.push(
      `${at}: ${tool}-disable${named} is never closed; add ${tool}-enable${named} right after the code that needs it`,
    );
  }
  return failures;
}

/** The unclosed block directives of one authored file. */
function checkFile(file) {
  const source = readFileSync(join(ROOT, file), "utf8");
  if (!/(?:oxlint|eslint)-(?:disable|enable)/u.test(source)) return [];
  if (!file.endsWith(".vue")) return unclosedBlocks(source, file, 0);
  const { descriptor } = parse(source, { filename: file });
  return [descriptor.script, descriptor.scriptSetup].flatMap((block) =>
    block ? unclosedBlocks(block.content, file, block.loc.start.line - 1) : [],
  );
}

const files = execFileSync(
  "git",
  ["ls-files", "-z", "--cached", "--others", "--exclude-standard"],
  { cwd: ROOT, encoding: "utf8" },
)
  .split("\0")
  .filter(
    (file) =>
      (SCRIPT_EXTENSIONS.has(extname(file)) || file.endsWith(".vue")) &&
      existsSync(join(ROOT, file)),
  );
const failures = files.flatMap(checkFile);
if (failures.length) {
  process.stderr.write(`${failures.join("\n")}\n`);
  process.exitCode = 1;
}
