import { spawnSync } from "node:child_process";
import path from "node:path";

/** Makes `directory` a git repository. */
export function gitInit(directory: string): void {
  spawnSync("git", ["init", "-q"], { cwd: directory });
}

/** Runs a shell script in `directory` with `binDirectory` first on the path: its exit status and what it printed. */
export function runScript(
  script: string,
  directory: string,
  binDirectory: string,
) {
  const run = spawnSync(script, {
    cwd: directory,
    shell: true,
    encoding: "utf8",
    env: {
      ...process.env,
      PATH: `${binDirectory}${path.delimiter}${process.env.PATH}`,
    },
  });
  return { status: run.status, output: `${run.stdout}${run.stderr}` };
}
