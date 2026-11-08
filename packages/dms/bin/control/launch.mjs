import { createRequire } from "node:module";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { RENDERER_CLI } from "./renderer.mjs";

const DROPPED_PREFIXES = ["ANTELOPEJS_", "npm_", "PNPM_", "DMS_", "MONGO_"];

/** This package's root, which resolves dms-control's own dependencies. */
export const PACKAGE_ROOT = resolve(import.meta.dirname, "..", "..");

/** The dms-control entry, which also serves the mail sink and the browser. */
export const CONTROL_BIN = join(PACKAGE_ROOT, "bin", "dms-control.mjs");

/** The AntelopeJS environment every run builds and starts. */
export const ENVIRONMENT = "docs";

/**
 * The folders the project's dependencies resolve from: the playground, the
 * module it belongs to, then this package.
 *
 * @param {{ playground: string, moduleRoot: string }} state The run
 * @returns {string[]} The folders, in order
 */
export function resolutionFolders(state) {
  return [state.playground, state.moduleRoot, PACKAGE_ROOT];
}

/**
 * The `ajs` and `ajs dms` entry points the playground installs, `ajs dms`
 * being the renderer checkout's when the run serves one.
 *
 * @param {string} playground The playground folder
 * @param {string} [renderer] The renderer checkout the run serves
 * @returns {{ ajs: string, dms: string }} Their scripts
 */
export function cliPaths(playground, renderer) {
  const require = createRequire(join(playground, "package.json"));
  const core = dirname(require.resolve("@antelopejs/core/package.json"));
  return {
    ajs: join(core, "dist", "core", "cli", "index.js"),
    dms: join(frontendPackage(playground, renderer), RENDERER_CLI),
  };
}

/**
 * The `@antelopejs/dms-frontend` that builds and serves the run's dashboard:
 * the renderer checkout, else the one the playground installs.
 *
 * @param {string} playground The playground folder
 * @param {string} [renderer] The renderer checkout the run serves
 * @returns {string} Its folder
 */
export function frontendPackage(playground, renderer) {
  const require = createRequire(join(playground, "package.json"));
  return (
    renderer ??
    dirname(require.resolve("@antelopejs/dms-frontend/package.json"))
  );
}

function inheritedEnv() {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) => !DROPPED_PREFIXES.some((prefix) => key.startsWith(prefix)),
    ),
  );
}

/**
 * The environment of every process a run starts: its own HOME, ports,
 * database, origin and secrets, an npm cache and a pnpm store shared by
 * every run, no update checks and no colors. Extra `KEY=VALUE` pairs from `--env` come last.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {NodeJS.ProcessEnv} The environment
 */
export function runEnv(state) {
  const cacheHome = process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache");
  return {
    ...inheritedEnv(),
    HOME: state.home,
    USERPROFILE: state.home,
    CI: "1",
    NO_COLOR: "1",
    AJS_NO_UPDATE_CHECK: "1",
    NO_UPDATE_NOTIFIER: "1",
    COREPACK_HOME:
      process.env.COREPACK_HOME ?? join(cacheHome, "node", "corepack"),
    npm_config_cache: join(cacheHome, "dms-control", "npm"),
    npm_config_store_dir: join(cacheHome, "dms-control", "pnpm-store"),
    PORT: String(state.apiPort),
    DMS_CLIENT_BASE_URL: state.webUrl,
    DMS_API_BASE_URL: state.apiUrl,
    DMS_PREBUILT: "1",
    DMS_SMTP_PORT: String(state.smtpPort),
    MONGO_URL: state.mongoUrl,
    MONGO_DATABASE: state.database,
    ...state.secrets,
    ...state.extraEnv,
  };
}

/**
 * How to run one of the playground's CLIs for the run: its own log, the
 * run's environment, from the run's playground copy or `cwd`.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @param {string} name The log name
 * @param {string} script The CLI script
 * @param {string[]} args Its arguments
 * @param {string} [cwd] Where to run it
 * @returns {{ name: string, program: string, args: string[], cwd: string, env: NodeJS.ProcessEnv, logs: string }} The process spec
 */
export function spec(state, name, script, args, cwd = state.runPlayground) {
  return {
    name,
    program: process.execPath,
    args: [script, ...args],
    cwd,
    env: runEnv(state),
    logs: state.logs,
  };
}
