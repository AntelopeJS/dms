import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { git } from "../git.mjs";
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
const DETAIL_LIMIT = 5;
const DETAIL_LENGTH = 160;
const OUTPUT_LIMIT = 64 * 1024 * 1024;

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

function scriptStatements(ts, path, source) {
  const { outputText } = ts.transpileModule(source, {
    fileName: path,
    compilerOptions: {
      target: ts.ScriptTarget.ES2022,
      module: ts.ModuleKind.ESNext,
      removeComments: true,
      experimentalDecorators: true,
    },
  });
  const file = ts.createSourceFile(
    "emit.js",
    outputText,
    ts.ScriptTarget.ES2022,
    true,
    ts.ScriptKind.JS,
  );
  const printer = ts.createPrinter({ removeComments: true });
  return file.statements
    .filter((statement) => !ts.isImportDeclaration(statement))
    .filter(
      (statement) =>
        !(ts.isExportDeclaration(statement) && statement.moduleSpecifier),
    )
    .map((statement) =>
      printer
        .printNode(ts.EmitHint.Unspecified, statement, file)
        .replace(/^export (default )?/, ""),
    );
}

function vueStatements(ts, path, source) {
  const scripts = [...source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/g)];
  const template = /<template\b[^>]*>([\s\S]*)<\/template>/.exec(source);
  return [
    ...scripts.flatMap(([, body]) => scriptStatements(ts, `${path}.ts`, body)),
    ...(template
      ? [`template ${template[1].replace(/\s+/g, " ").trim()}`]
      : []),
  ];
}

function statementsOf(ts, path, source) {
  if (path.endsWith(".vue")) return vueStatements(ts, path, source);
  if (CODE_EXTENSIONS.has(extname(path)))
    return scriptStatements(ts, path, source);
  return [`file ${source.replace(/\s+/g, " ").trim()}`];
}

/**
 * What the covered code does at a commit, as the sorted top-level
 * statements of its JavaScript: types, comments, formatting, imports and
 * export keywords left out, so a type-only edit, a comment or a verbatim
 * move between covered files keeps the same fingerprint.
 *
 * @param {string} repo The checkout
 * @param {string} sha The commit
 * @param {string[]} files The covered files
 * @returns {string[]} The fingerprint
 */
export function emitFingerprint(repo, sha, files) {
  const ts = loadTypeScript(repo);
  return files
    .flatMap((path) => {
      const source = fileAt(repo, sha, path);
      return source === null ? [] : statementsOf(ts, path, source);
    })
    .sort((left, right) => left.localeCompare(right));
}

function worktreeAt(repo, sha) {
  const dir = mkdtempSync(join(tmpdir(), "dms-control-behaviour-"));
  git(["worktree", "add", "--quiet", "--detach", "--force", dir, sha], repo);
  symlinkSync(join(repo, "node_modules"), join(dir, "node_modules"));
  return dir;
}

/**
 * Runs `action` in a throwaway worktree of `sha` whose `node_modules` links
 * the checkout's, then removes it.
 *
 * @param {string} repo The checkout
 * @param {string} sha The commit
 * @param {(dir: string) => any} action What to run there
 * @returns {any} What `action` returned
 */
export function inWorktree(repo, sha, action) {
  const dir = worktreeAt(repo, sha);
  try {
    return action(dir);
  } finally {
    git(["worktree", "remove", "--force", dir], repo);
    rmSync(dir, { recursive: true, force: true });
  }
}

function probeFingerprint(repo, command, sha) {
  const [program, ...args] = command;
  return inWorktree(repo, sha, (dir) => {
    const run = spawnSync(program, [...args, dir], {
      cwd: repo,
      encoding: "utf8",
      maxBuffer: OUTPUT_LIMIT,
    });
    if (run.status !== 0)
      throw new Error(
        `behaviour probe ${command.join(" ")} failed on ${sha}:\n${run.stderr}`,
      );
    return run.stdout.split("\n").filter(Boolean);
  });
}

function difference(left, right) {
  const counts = new Map();
  for (const item of right) counts.set(item, (counts.get(item) ?? 0) + 1);
  return left.filter((item) => {
    const count = counts.get(item) ?? 0;
    if (count === 0) return true;
    counts.set(item, count - 1);
    return false;
  });
}

function summary(lines) {
  return lines
    .slice(0, DETAIL_LIMIT)
    .map((line) =>
      line.length > DETAIL_LENGTH ? `${line.slice(0, DETAIL_LENGTH)}…` : line,
    );
}

/**
 * Whether a diff changed the behaviour of the code a formal check covers,
 * decided without judgement: the check's `behaviour` probe prints the same
 * lines on the base and on HEAD, or, for `emit`, the covered files keep
 * the same JavaScript statements.
 *
 * @param {Record<string, any>} skill The skill
 * @param {Record<string, any>} check The formal check
 * @param {{ baseSha: string, headSha: string }} commits The two commits
 * @returns {{ method: string, changed: boolean, removed: string[], added: string[] }} The decision and what differs
 */
export function behaviourChange(skill, check, commits) {
  const probe =
    check.behaviour?.kind === "probe" ? check.behaviour.command : null;
  const fingerprint = (sha) =>
    probe
      ? probeFingerprint(skill.repo, probe, sha)
      : emitFingerprint(skill.repo, sha, check.covers);
  const base = fingerprint(commits.baseSha);
  const head = fingerprint(commits.headSha);
  const removed = difference(base, head);
  const added = difference(head, base);
  return {
    method: probe ? `probe ${probe.join(" ")}` : "emit",
    changed: removed.length + added.length > 0,
    removed: summary(removed),
    added: summary(added),
  };
}
