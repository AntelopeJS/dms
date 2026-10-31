import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { descendantsOf, isAlive, listenersOf, probe } from "./processes.mjs";
import { checkoutOf } from "./git.mjs";
import { apiRequest } from "./session.mjs";
import { packageVersion } from "./stack.mjs";

/** @typedef {import("./run-state.mjs").RunState} RunState */

const SKIPPED = new Set([
  "node_modules",
  ".antelope",
  ".dms-frontend",
  "dist",
  "tests",
  ".nuxt",
  ".output",
]);

/**
 * @param {string} folder
 * @returns {number}
 */
function newestMtime(folder) {
  if (!existsSync(folder)) return 0;
  let newest = 0;
  for (const entry of readdirSync(folder, { withFileTypes: true })) {
    if (SKIPPED.has(entry.name)) continue;
    const path = join(folder, entry.name);
    newest = Math.max(
      newest,
      entry.isDirectory() ? newestMtime(path) : statSync(path).mtimeMs,
    );
  }
  return newest;
}

/**
 * @param {string} file
 * @returns {number}
 */
function mtime(file) {
  return existsSync(file) ? statSync(file).mtimeMs : 0;
}

/**
 * @param {string} check
 * @param {boolean} ok
 * @param {string} detail
 * @returns {{ check: string, ok: boolean, detail: string }}
 */
function line(check, ok, detail) {
  return { check, ok, detail };
}

/** @param {RunState} state */
function processLines(state) {
  const family = new Set([
    ...state.processes.map((record) => record.pid),
    ...descendantsOf(state.processes.map((record) => record.pid)),
  ]);
  return state.processes.flatMap((record) => {
    const lines = [
      line(
        `${record.name} pid ${record.pid} alive`,
        isAlive(record.pid),
        record.command,
      ),
    ];
    if (record.port) {
      const listeners = listenersOf(record.port);
      const owned =
        listeners === null
          ? null
          : listeners.length > 0 && listeners.every((pid) => family.has(pid));
      lines.push(
        line(
          `port ${record.port} held by the run`,
          owned !== false,
          listeners === null
            ? "unknown without /proc"
            : `listening pids ${listeners.join(", ") || "none"}`,
        ),
      );
    }
    return lines;
  });
}

/**
 * @param {RunState} state
 * @returns {string}
 */
function frontendBackendUrl(state) {
  const frontend = state.processes.find((record) => record.name === "frontend");
  if (!frontend) return "no frontend recorded";
  const pids = [frontend.pid, ...descendantsOf([frontend.pid])];
  const cmdlines = pids.map((pid) => {
    try {
      return readFileSync(`/proc/${pid}/cmdline`, "utf8").split("\0");
    } catch {
      return [];
    }
  });
  const args =
    cmdlines.find((parts) => parts.includes("-b")) ??
    frontend.command.split(" ");
  return args[args.indexOf("-b") + 1] ?? "no -b";
}

/** @param {RunState} state */
function versions(state) {
  const require = createRequire(join(state.playground, "package.json"));
  /**
   * @param {string} name
   * @returns {string}
   */
  const version = (name) => {
    try {
      return packageVersion(require.resolve(`${name}/package.json`));
    } catch {
      return "missing";
    }
  };
  return {
    module: `${packageVersion(join(state.moduleRoot, "package.json"))} (${state.moduleRoot})`,
    core: version("@antelopejs/core"),
    dmsFrontend: version("@antelopejs/dms-frontend"),
  };
}

/** @param {RunState} state */
function freshnessLines(state) {
  const moduleDist = join(state.moduleRoot, "dist");
  const playgroundDist = join(state.playground, "dist");
  const frontendBuild = join(
    state.runPlayground ?? "",
    ".dms-frontend",
    "dist",
  );
  const frontendSources = Math.max(
    newestMtime(join(state.moduleRoot, "frontend-vue")),
    newestMtime(join(state.playground, "frontend-vue")),
  );
  return [
    line(
      "module dist newer than src",
      !existsSync(join(state.moduleRoot, "src")) ||
        newestMtime(moduleDist) >= newestMtime(join(state.moduleRoot, "src")),
      moduleDist,
    ),
    line(
      "playground dist newer than src",
      !existsSync(join(state.playground, "src")) ||
        newestMtime(playgroundDist) >=
          newestMtime(join(state.playground, "src")),
      playgroundDist,
    ),
    line(
      "frontend build newer than frontend-vue",
      mtime(frontendBuild) >= frontendSources,
      frontendBuild,
    ),
  ];
}

/** @param {RunState} state */
function headLine(state) {
  const now = state.repo ? checkoutOf(state.repo).head : null;
  return line(
    "checkout HEAD unchanged since up",
    now === state.headSha,
    `up at ${state.headSha ?? "no checkout"}, now ${now ?? "no checkout"}`,
  );
}

/** @param {RunState} state */
async function sessionLine(state) {
  if (!state.accounts?.admin)
    return line("admin session", true, "not onboarded yet");
  const me = await apiRequest(state, {
    method: "GET",
    path: "/api/auth/me",
    as: "admin",
    label: "doctor me",
  });
  return line(
    "admin session valid",
    me.status === 200 && me.body?.email === state.accounts.admin.email,
    `GET /api/auth/me ${me.status}`,
  );
}

/**
 * Answers whether a run is worth driving: every recorded process is alive
 * and holds its port, both servers answer, the frontend serves this run's
 * backend, the builds are newer than their sources, the database is the
 * run's own, and the admin session (once onboarded) is valid.
 *
 * @param {import("./run-state.mjs").RunState} state The run
 * @returns {Promise<{ check: string, ok: boolean, detail: string }[]>} One line per check
 */
export async function doctor(state) {
  const backendUrl = frontendBackendUrl(state);
  const found = versions(state);
  const lines = [
    line("run is ready", state.ready === true, state.error ?? state.dir),
    ...processLines(state),
    line(
      "backend answers",
      (await probe(`${state.apiUrl}/api/onboarding/informations`)) === 200,
      `${state.apiUrl}/api/onboarding/informations`,
    ),
    line(
      "frontend answers",
      (await probe(`${state.webUrl}/dms-preview`)) === 200,
      `${state.webUrl}/dms-preview`,
    ),
    line(
      "frontend -b is this run's backend",
      backendUrl === state.apiUrl,
      backendUrl,
    ),
    line(
      "versions",
      found.core !== "missing" && found.dmsFrontend !== "missing",
      `module ${found.module}, @antelopejs/core ${found.core}, @antelopejs/dms-frontend ${found.dmsFrontend}`,
    ),
    ...freshnessLines(state),
    line(
      "database is the run's",
      state.database.startsWith(state.databasePrefix),
      `${state.mongoUrl}/${state.database}`,
    ),
    headLine(state),
    line(
      "playground copy is the run's",
      Boolean(state.runPlayground?.startsWith(state.dir)) &&
        existsSync(join(state.runPlayground, ".antelope")),
      String(state.runPlayground),
    ),
    line(
      "module copy links the checkout",
      existsSync(join(dirname(state.runPlayground ?? ""), "package.json")) &&
        Boolean(state.runPlayground?.startsWith(state.root)),
      state.root,
    ),
  ];
  lines.push(await sessionLine(state));
  return lines;
}
