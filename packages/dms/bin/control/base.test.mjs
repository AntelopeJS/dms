import assert from "node:assert/strict";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { baseCheckout } from "./base.mjs";
import { git } from "./git.mjs";
import { setEnv } from "./helpers/env.mjs";
import { write } from "./helpers/repo.mjs";

const PLAYGROUND = join(".agents", "skills", "verify", "playground");

/**
 * A repository whose commit `base` has no playground and whose HEAD adds
 * one, with installed modules left untracked. The base cache is scratch.
 *
 * @param {import("node:test").TestContext} t The test
 * @returns {{ repo: string, playground: string }} Its paths
 */
function repoWithNewPlayground(t) {
  const root = realpathSync(
    mkdtempSync(join(tmpdir(), "dms-control-base-test-")),
  );
  t.after(() => rmSync(root, { recursive: true, force: true }));
  setEnv(t, { XDG_CACHE_HOME: join(root, "cache") });
  const repo = join(root, "repo");
  mkdirSync(repo);
  git(["init", "-q", "-b", "main"], repo);
  git(["config", "user.email", "test@example.com"], repo);
  git(["config", "user.name", "test"], repo);
  write(join(repo, "README.md"), "base\n");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "base"], repo);
  git(["tag", "base"], repo);
  const playground = join(repo, PLAYGROUND);
  write(join(playground, "antelope.config.ts"), "head\n");
  write(join(playground, ".gitignore"), "node_modules\n");
  write(join(playground, "node_modules", "zod", "package.json"), "{}");
  git(["add", "."], repo);
  git(["commit", "-q", "-m", "add the playground"], repo);
  return { repo, playground };
}

await test("a base ref without the playground prepares a copy of the run's playground", (t) => {
  const { repo, playground } = repoWithNewPlayground(t);
  const prepare = [
    ["grep", "-qx", "head", join(PLAYGROUND, "antelope.config.ts")],
    ["grep", "-qx", "base", "README.md"],
  ];
  const base = baseCheckout(
    { repo, playground, baseRef: "base" },
    { config: { prepare } },
  );
  assert.equal(base.sha, git(["rev-parse", "base"], repo));
  assert.equal(base.playground, join(base.dir, PLAYGROUND));
  assert.equal(existsSync(join(base.playground, "node_modules")), false);
});
