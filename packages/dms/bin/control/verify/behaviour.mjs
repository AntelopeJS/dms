import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git.mjs";
import { emitFingerprint } from "./emit.mjs";

const DETAIL_LIMIT = 5;
const OUTPUT_LIMIT = 64 * 1024 * 1024;

/**
 * @param {string} repo The checkout
 * @param {string} sha The commit
 * @returns {string} The scratch worktree
 */
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
 * @param {(dir: string) => Result} action What to run there
 * @returns {Result} What `action` returned
 * @template Result
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

/**
 * @param {string} repo The checkout
 * @param {string[]} command The probe command
 * @param {string} sha The commit
 * @returns {string[]} The lines the probe printed
 */
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

/**
 * @param {{ structure: string, text: string }[]} left The items
 * @param {{ structure: string, text: string }[]} right The items to subtract
 * @returns {{ structure: string, text: string }[]} The items of `left` that `right` lacks
 */
function difference(left, right) {
  /** @type {Map<string, number>} */
  const counts = new Map();
  for (const item of right)
    counts.set(item.structure, (counts.get(item.structure) ?? 0) + 1);
  return left.filter((item) => {
    const count = counts.get(item.structure) ?? 0;
    if (count === 0) return true;
    counts.set(item.structure, count - 1);
    return false;
  });
}

/**
 * @param {string} path The covered file
 * @param {{ structure: string, text: string }[]} base Its statements at the base
 * @param {{ structure: string, text: string }[]} head Its statements at HEAD
 * @returns {{ removed: string[], added: string[] }} The first statement that differs
 */
function sequenceChanges(path, base, head) {
  const length = Math.max(base.length, head.length);
  for (let index = 0; index < length; index += 1) {
    if (base[index]?.structure !== head[index]?.structure) {
      return {
        removed: [
          `${path} statement ${index + 1}: ${base[index]?.text ?? "(none)"}`,
        ],
        added: [
          `${path} statement ${index + 1}: ${head[index]?.text ?? "(none)"}`,
        ],
      };
    }
  }
  return { removed: [], added: [] };
}

/**
 * @param {ReturnType<typeof emitFingerprint>} base The fingerprint at the base
 * @param {ReturnType<typeof emitFingerprint>} head The fingerprint at HEAD
 * @returns {{ removed: string[], added: string[] }} What differs
 */
function compareEmit(base, head) {
  const removed = difference(base.functions, head.functions).map(
    (item) => `hoisted ${item.text}`,
  );
  const added = difference(head.functions, base.functions).map(
    (item) => `hoisted ${item.text}`,
  );
  for (const path of new Set([
    ...Object.keys(base.files),
    ...Object.keys(head.files),
  ])) {
    const change = sequenceChanges(
      path,
      base.files[path] ?? [],
      head.files[path] ?? [],
    );
    removed.push(...change.removed);
    added.push(...change.added);
  }
  return { removed, added };
}

/**
 * @param {string[]} base The probe lines at the base
 * @param {string[]} head The probe lines at HEAD
 * @returns {{ removed: string[], added: string[] }} What differs
 */
function compareProbe(base, head) {
  /**
   * @param {string[]} list Probe lines
   * @returns {{ structure: string, text: string }[]} The lines as items
   */
  const lines = (list) => list.map((line) => ({ structure: line, text: line }));
  if (JSON.stringify(base) === JSON.stringify(head))
    return { removed: [], added: [] };
  const removed = difference(lines(base), lines(head)).map((item) => item.text);
  const added = difference(lines(head), lines(base)).map((item) => item.text);
  return removed.length + added.length > 0
    ? { removed, added }
    : { removed: ["(order)"], added: ["(order)"] };
}

/**
 * Whether a diff changed the behaviour of the code a formal check covers,
 * decided without judgement. For `emit`, each covered file keeps its
 * top-level statements, in order, with the same structure, and the covered
 * function declarations stay the same wherever they live; for `probe`, the
 * check's probe prints the same lines on a checkout of the base and of HEAD.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {Pick<import("./types.mjs").FormalCheck, "covers" | "behaviour">} check The formal check
 * @param {import("./types.mjs").Commits} commits The two commits
 * @returns {import("./types.mjs").BehaviourChange} The decision and what differs
 */
export function behaviourChange(skill, check, commits) {
  const probe =
    check.behaviour?.kind === "probe" ? check.behaviour.command : null;
  const change = probe
    ? compareProbe(
        probeFingerprint(skill.repo, probe, commits.baseSha),
        probeFingerprint(skill.repo, probe, commits.headSha),
      )
    : compareEmit(
        emitFingerprint(skill.repo, commits.baseSha, check.covers),
        emitFingerprint(skill.repo, commits.headSha, check.covers),
      );
  return {
    method: probe ? `probe ${probe.join(" ")}` : "emit",
    changed: change.removed.length + change.added.length > 0,
    removed: change.removed.slice(0, DETAIL_LIMIT),
    added: change.added.slice(0, DETAIL_LIMIT),
  };
}
