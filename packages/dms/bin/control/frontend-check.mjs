import { randomBytes } from "node:crypto";
import { rmSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import {
  buildInputs,
  buildKey,
  sourceNames,
  WORKSPACE_FOLDER,
} from "./build-key.mjs";
import { layOutCopy } from "./run-copy.mjs";
import { frontendPackage } from "./launch.mjs";
import { workspaceSetup } from "./stack.mjs";

const SUFFIX_BYTES = 4;

/**
 * The key of the run's frontend build inputs as a fresh `up` would read
 * them now: a new copy of the playground (see `layOutCopy`) with the run's
 * installed project modules, whose workspace is set up without installing,
 * keyed with the versions the run's own workspace installed. The copy is
 * removed.
 *
 * @param {import("./run-state.mjs").RunState} state The run, after `up`
 * @returns {Promise<string>} The key
 */
export async function currentFrontendBuildKey(state) {
  const scratch = join(
    state.dir,
    `frontend-check-${randomBytes(SUFFIX_BYTES).toString("hex")}`,
  );
  try {
    const project = layOutCopy(
      state.playground,
      state.repo ?? state.moduleRoot,
      scratch,
      state.renderer,
    );
    symlinkSync(
      join(state.runPlayground ?? "", ".antelope"),
      join(project, ".antelope"),
    );
    const workspace = join(project, WORKSPACE_FOLDER);
    await workspaceSetup(state, "frontend-check", project, false)(workspace);
    return buildKey(
      buildInputs(state, frontendPackage(state.playground, state.renderer), {
        project,
        workspace,
        names: sourceNames(workspace),
        installed: join(state.runPlayground ?? "", WORKSPACE_FOLDER),
      }),
    );
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
}
