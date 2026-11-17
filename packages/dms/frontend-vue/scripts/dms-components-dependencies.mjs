import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

export const RENDERER = "@antelopejs/dms-frontend";

/**
 * The parsers and the renderer's globals the check works with.
 *
 * @typedef {object} DmsComponentsTools
 * @property {typeof import("typescript")} ts
 * @property {typeof import("vue/compiler-sfc").parse} parse
 * @property {string | undefined} rendererGlobals
 */

/**
 * @param {unknown} value
 * @returns {value is string}
 */
function isString(value) {
  return typeof value === "string";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, string>}
 */
function isStringRecord(value) {
  return isRecord(value) && Object.values(value).every(isString);
}

/**
 * @param {string} path
 * @returns {{ peerDependencies: Record<string, string>, engines: Record<string, string> }}
 */
function manifest(path) {
  /** @type {unknown} */
  const parsed = JSON.parse(
    readFileSync(new URL(path, import.meta.url), "utf8"),
  );
  if (
    !isRecord(parsed) ||
    !isStringRecord(parsed.peerDependencies) ||
    !isStringRecord(parsed.engines)
  )
    throw new Error(`${path} lists no peerDependencies and engines of strings`);
  return {
    peerDependencies: parsed.peerDependencies,
    engines: parsed.engines,
  };
}

const FRONTEND = manifest("../package.json");

/**
 * The development dependencies the check resolves, at the range the
 * installed `@antelopejs/dms` declares for each. `typescript` and `vue` parse
 * the layer's files; the renderer only lists the components it registers
 * itself, such as `DmsLink`.
 *
 * @type {Readonly<Record<"typescript" | "vue" | typeof RENDERER, string>>}
 */
const DMS_COMPONENTS_DEPENDENCIES = Object.freeze({
  typescript: manifest("../../package.json").peerDependencies.typescript,
  vue: FRONTEND.peerDependencies.vue,
  [RENDERER]: FRONTEND.engines[RENDERER],
});

/**
 * How the package manager running the check adds a development dependency.
 *
 * @type {Readonly<Record<string, string>>}
 */
const ADD_DEV_DEPENDENCY = {
  pnpm: "pnpm add -D",
  npm: "npm install -D",
  yarn: "yarn add -D",
  bun: "bun add -d",
};

/**
 * The command that adds `packages` at their range, for the package manager running the check.
 *
 * @param {(keyof typeof DMS_COMPONENTS_DEPENDENCIES)[]} packages
 * @returns {string}
 */
export function addCommand(packages) {
  const manager = (process.env.npm_config_user_agent ?? "").split("/")[0];
  const add = Object.hasOwn(ADD_DEV_DEPENDENCY, manager)
    ? ADD_DEV_DEPENDENCY[manager]
    : ADD_DEV_DEPENDENCY.pnpm;
  const specs = packages.map(
    (name) => `"${name}@${DMS_COMPONENTS_DEPENDENCIES[name]}"`,
  );
  return `${add} ${specs.join(" ")}`;
}

/**
 * @param {NodeJS.Require[]} requires
 * @param {string} specifier
 * @returns {string | undefined}
 */
function resolveFirst(requires, specifier) {
  for (const require of requires) {
    try {
      return require.resolve(specifier);
    } catch {
      continue;
    }
  }
  return undefined;
}

/**
 * Resolves `typescript` and `vue` from the layer, then from the installed
 * `@antelopejs/dms`, and the renderer from the layer alone.
 *
 * @param {string} layer
 * @returns {DmsComponentsTools}
 */
export function dependencies(layer) {
  const manifest = join(layer, "package.json");
  if (!existsSync(manifest)) throw new Error(`No package.json in ${layer}`);
  const fromLayer = createRequire(manifest);
  const parsers = [fromLayer, createRequire(import.meta.url)];
  const typescript = resolveFirst(parsers, "typescript");
  const sfc = resolveFirst(parsers, "vue/compiler-sfc");
  /** @type {("typescript" | "vue")[]} */
  const missing = [];
  if (!typescript) missing.push("typescript");
  if (!sfc) missing.push("vue");
  if (!typescript || !sfc)
    throw new Error(
      `The DMS component check parses the layer with typescript and vue, and ${missing.join(" and ")} cannot be resolved from ${layer}. In ${layer}, run: ${addCommand(missing)}`,
    );
  const require = createRequire(import.meta.url);
  /** @type {(id: string) => typeof import("typescript")} */
  const loadTypeScript = require;
  /** @type {(id: string) => typeof import("vue/compiler-sfc")} */
  const loadSfc = require;
  return {
    ts: loadTypeScript(typescript),
    parse: loadSfc(sfc).parse,
    rendererGlobals: resolveFirst([fromLayer], `${RENDERER}/eslint-globals`),
  };
}

/**
 * @param {unknown} loaded
 * @returns {loaded is { default: Record<string, unknown> }}
 */
function hasGlobals(loaded) {
  return (
    isRecord(loaded) &&
    Object.hasOwn(loaded, "default") &&
    isRecord(loaded.default)
  );
}

/**
 * The `Dms` components the `@antelopejs/dms-frontend` renderer registers itself, or none when it is not installed.
 *
 * @param {string | undefined} globalsPath
 * @returns {Promise<string[]>}
 */
export async function rendererComponentNames(globalsPath) {
  if (!globalsPath) return [];
  /** @type {unknown} */
  const loaded = await import(pathToFileURL(globalsPath).href);
  if (!hasGlobals(loaded))
    throw new Error(`${globalsPath} exports no globals object by default`);
  return Object.keys(loaded.default).filter((name) => /^Dms[A-Z]/.test(name));
}
