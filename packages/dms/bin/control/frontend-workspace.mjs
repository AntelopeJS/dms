import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import { describeFailure } from "./failure.mjs";
import { isRecord } from "./json.mjs";

/**
 * @typedef {{ force: boolean, mode: "build", workspaceDir: string, project: { projectDir: string, environment: string }, beforeInstall?: () => Promise<void> }} SetupOptions The options `ajs dms build` passes the dms-frontend's `setupWorkspace`, with the hook it calls before it installs
 * @typedef {(options: { workspaceDir: string }) => Promise<{ workspaceDir: string, layers: unknown[] }>} WorkspaceStep The step of `ajs dms build` that sets its workspace up
 */

const INSTALL_MARK = ".deps-hash";
const WORKSPACE_STEP = "./dist/commands/workspace-task.js";

/**
 * The exit code of an `ajs dms build` that cannot build in its prepared
 * workspace, before it built anything: its workspace step could not be
 * replaced, or the workspace was not prepared.
 */
export const PREPARED_WORKSPACE_REFUSED = 75;

class StoppedBeforeInstall extends Error {}

/**
 * @param {unknown} value
 * @returns {value is (options: SetupOptions) => Promise<unknown>}
 */
function isSetup(value) {
  return typeof value === "function";
}

/**
 * @param {unknown} value
 * @returns {value is () => unknown}
 */
function isEnvLoader(value) {
  return typeof value === "function";
}

/**
 * @param {string} frontendPackage
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function loadModule(frontendPackage, file) {
  /** @type {unknown} */
  const loaded = createRequire(join(frontendPackage, "package.json"))(file);
  if (!isRecord(loaded)) throw new Error(`${file} exports nothing`);
  return loaded;
}

/**
 * @template T
 * @param {string} frontendPackage
 * @param {string} file
 * @param {string} name
 * @param {(value: unknown) => value is T} guard
 * @returns {T}
 */
function exported(frontendPackage, file, name, guard) {
  const loaded = loadModule(frontendPackage, file);
  const value = Object.hasOwn(loaded, name) ? loaded[name] : undefined;
  if (!guard(value)) throw new Error(`${file} exports no ${name}`);
  return value;
}

/**
 * Makes the workspace step of the `ajs dms build` running in this process
 * return the workspace it is given as it is, which `prepare-frontend` must
 * have set up and installed, instead of setting it up again. A workspace
 * that was not prepared ends the process with
 * {@link PREPARED_WORKSPACE_REFUSED}.
 *
 * @param {string} frontendPackage The `@antelopejs/dms-frontend` folder that builds
 * @throws When this dms-frontend has no such step, or exports it in a shape that cannot be replaced (an accessor, as a re-export compiles to, or a module namespace)
 */
export function buildInPreparedWorkspace(frontendPackage) {
  const step = loadModule(frontendPackage, WORKSPACE_STEP);
  exported(frontendPackage, WORKSPACE_STEP, "setUpWorkspace", isSetup);
  /** @type {WorkspaceStep} */
  const prepared = (options) => {
    const workspaceDir = resolve(options.workspaceDir);
    if (!existsSync(join(workspaceDir, INSTALL_MARK))) {
      process.stderr.write(`dms-control: ${workspaceDir} is not prepared\n`);
      process.exit(PREPARED_WORKSPACE_REFUSED);
    }
    return Promise.resolve({ workspaceDir, layers: [] });
  };
  try {
    step.setUpWorkspace = prepared;
  } catch (error) {
    throw new Error(
      `${WORKSPACE_STEP} exports a setUpWorkspace that cannot be replaced (${describeFailure(error)})`,
    );
  }
}

/**
 * Sets up a frontend build workspace for the project in the current folder
 * as `ajs dms build` does before its first build step: it loads the
 * project's `.env.local` and `.env`, then runs the dms-frontend's own
 * `setupWorkspace`, which copies the templates and each module's frontend,
 * generates the registries and installs. Without `install`, it stops before
 * the install. It first replaces this process's workspace step as the
 * build's preload does (see {@link buildInPreparedWorkspace}), so a
 * dms-frontend whose step cannot be replaced fails the setup, not the build.
 *
 * @param {string} frontendPackage The `@antelopejs/dms-frontend` folder that builds
 * @param {string} workspace The workspace folder
 * @param {string} environment The AntelopeJS environment
 * @param {boolean} install Whether to install the workspace's dependencies
 * @returns {Promise<void>} Resolves once it is set up
 * @throws When this dms-frontend cannot set a workspace up, or build in one set up beforehand
 */
export async function setUpFrontendWorkspace(
  frontendPackage,
  workspace,
  environment,
  install,
) {
  buildInPreparedWorkspace(frontendPackage);
  const loadProjectEnv = exported(
    frontendPackage,
    "./dist/env-file.js",
    "loadProjectEnv",
    isEnvLoader,
  );
  const setupWorkspace = exported(
    frontendPackage,
    "./dist/workspace-setup.js",
    "setupWorkspace",
    isSetup,
  );
  loadProjectEnv();
  /** @type {SetupOptions} */
  const options = {
    force: false,
    mode: "build",
    workspaceDir: workspace,
    project: { projectDir: ".", environment },
  };
  if (!install) {
    options.beforeInstall = () => Promise.reject(new StoppedBeforeInstall());
  }
  try {
    await setupWorkspace(options);
  } catch (error) {
    if (!(error instanceof StoppedBeforeInstall)) throw error;
  }
}
