import { execFileSync, spawnSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { git } from "../git.mjs";
import { originRepository } from "./verdict.mjs";

const EVIDENCE_BRANCH = "verify-evidence";
const SCRATCH_BRANCH = "verify-evidence-scratch";

/**
 * @param {string} repo The checkout
 * @returns {boolean} Whether origin holds the evidence branch
 */
function remoteBranchExists(repo) {
  return git(["ls-remote", "--heads", "origin", EVIDENCE_BRANCH], repo) !== "";
}

/**
 * Commits the run's evidence under `pr-<n>/<sha>/` of the orphan
 * `verify-evidence` branch and pushes it, from a temporary worktree so the
 * checkout under review is never touched.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {import("../run-state.mjs").RunState} state The run
 * @param {{ pr: number, headSha: string, result: string }} verdict The verdict
 * @returns {string} The pushed evidence commit
 */
export function pushEvidence(skill, state, verdict) {
  const repo = skill.repo;
  const worktree = mkdtempSync(join(tmpdir(), "verify-evidence-"));
  try {
    if (remoteBranchExists(repo)) {
      git(
        [
          "fetch",
          "--quiet",
          "origin",
          `${EVIDENCE_BRANCH}:refs/remotes/origin/${EVIDENCE_BRANCH}`,
        ],
        repo,
      );
      git(
        [
          "worktree",
          "add",
          "--quiet",
          "--detach",
          worktree,
          `origin/${EVIDENCE_BRANCH}`,
        ],
        repo,
      );
    } else {
      git(
        [
          "worktree",
          "add",
          "--quiet",
          "--orphan",
          "-B",
          SCRATCH_BRANCH,
          worktree,
        ],
        repo,
      );
    }
    const target = join(worktree, `pr-${verdict.pr}`, verdict.headSha);
    rmSync(target, { recursive: true, force: true });
    mkdirSync(target, { recursive: true });
    cpSync(state.evidence, target, { recursive: true });
    git(["add", "--all", "."], worktree);
    const message = `verify: evidence for #${verdict.pr} at ${verdict.headSha.slice(0, 7)} (${verdict.result})`;
    git(
      [
        "-c",
        "commit.gpgsign=false",
        "commit",
        "--quiet",
        "--allow-empty",
        "--no-verify",
        "-m",
        message,
      ],
      worktree,
    );
    git(
      [
        "push",
        "--quiet",
        "--no-verify",
        "origin",
        `HEAD:refs/heads/${EVIDENCE_BRANCH}`,
      ],
      worktree,
    );
    return git(["rev-parse", "HEAD"], worktree);
  } finally {
    git(["worktree", "remove", "--force", worktree], repo);
    if (git(["branch", "--list", SCRATCH_BRANCH], repo) !== "") {
      git(["branch", "--quiet", "-D", SCRATCH_BRANCH], repo);
    }
  }
}

/**
 * Posts the verdict as a PR comment.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {{ pr: number, markdown: string }} verdict The verdict
 * @returns {string} The comment URL gh prints
 */
export function postComment(skill, verdict) {
  return execFileSync(
    "gh",
    [
      "pr",
      "comment",
      String(verdict.pr),
      "--repo",
      originRepository(skill.repo),
      "--body",
      verdict.markdown,
    ],
    { cwd: skill.repo, encoding: "utf8" },
  ).trim();
}

/**
 * Sets the `verify` commit status on the head SHA the verdict judged:
 * `success` for PASS and PASS+NOTES, `failure` for FAIL.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {{ headSha: string, result: string }} verdict The verdict
 * @param {string} targetUrl The comment URL
 * @returns {string | null} GitHub's error when the status could not be set
 */
export function setStatus(skill, verdict, targetUrl) {
  const state = verdict.result === "FAIL" ? "failure" : "success";
  const result = spawnSync(
    "gh",
    [
      "api",
      "--silent",
      `repos/${originRepository(skill.repo)}/statuses/${verdict.headSha}`,
      "-f",
      `state=${state}`,
      "-f",
      "context=verify",
      "-f",
      `description=${skill.name}: ${verdict.result}`,
      "-f",
      `target_url=${targetUrl}`,
    ],
    { cwd: skill.repo, encoding: "utf8" },
  );
  return result.status === 0
    ? null
    : `${result.stderr}${result.stdout}`.trim() || `gh exited ${result.status}`;
}

/**
 * Reads back the `verify` status GitHub holds for a SHA, so the write is
 * checked through a second command.
 *
 * @param {import("./skill.mjs").Skill} skill The skill
 * @param {string} sha The commit
 * @returns {string} The status state, or `absent`
 */
export function readStatus(skill, sha) {
  /** @type {{ context: string, state: string }[]} */
  const statuses = JSON.parse(
    execFileSync(
      "gh",
      ["api", `repos/${originRepository(skill.repo)}/commits/${sha}/statuses`],
      {
        cwd: skill.repo,
        encoding: "utf8",
      },
    ),
  );
  return (
    statuses.find((status) => status.context === "verify")?.state ?? "absent"
  );
}
