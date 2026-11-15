import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { z } from "zod";

const frontend = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const root = resolve(frontend, "../../..");
/** @type {(id: string) => typeof import("vite")} */
const require = createRequire(import.meta.url);
const { createServer } = require("vite");
const baseRef = process.argv[2] ?? "HEAD^";
assert(process.argv[3], "Pass the baseline worktree as the third argument");
const baseRoot = resolve(process.argv[3]);
const baseFrontend = join(baseRoot, "packages/dms/frontend-vue");
assert.equal(
  execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: baseRoot,
    encoding: "utf8",
  }),
  execFileSync("git", ["rev-parse", baseRef], { cwd: root, encoding: "utf8" }),
  "The baseline files belong to the requested revision",
);
const base = execFileSync(
  "git",
  ["show", `${baseRef}:packages/dms/frontend-vue/dms.frontend.ts`],
  { cwd: root, encoding: "utf8" },
);
const renamed = new Map(
  execFileSync(
    "git",
    ["diff", "--name-status", "--find-renames=100%", baseRef, "HEAD"],
    { cwd: root, encoding: "utf8" },
  )
    .trim()
    .split("\n")
    .filter((line) => line.startsWith("R100\t"))
    .map((line) => {
      const [, before, after] = line.split("\t");
      return [
        relative(frontend, resolve(root, after)),
        relative(frontend, resolve(root, before)),
      ];
    }),
);
const current = readFileSync(join(frontend, "dms.frontend.ts"), "utf8");
const baseId = join(baseFrontend, "__registry-proof-base.ts");
const currentId = join(frontend, "__registry-proof-current.ts");
const server = await createServer({
  root: frontend,
  configFile: false,
  optimizeDeps: { noDiscovery: true },
  server: { middlewareMode: true, watch: null },
  plugins: [
    {
      name: "registration-observer",
      enforce: "pre",
      resolveId(id, importer) {
        if ([baseId, currentId].includes(id)) return id;
        if (id === "#dms/frontend-module") return "\0registry-sdk";
        if (id.endsWith(".vue")) {
          const file = id.startsWith("/layers/")
            ? resolve(frontend, "." + id)
            : resolve(dirname(importer), id);
          return (
            "\0registry-component:" +
            relative(
              file.startsWith(baseFrontend + "/") ? baseFrontend : frontend,
              file,
            )
          );
        }
        if (/\/app\/(?:plugins|middleware)\//.test(id) || id.endsWith(".css"))
          return "\0registry-inert:" + id;
      },
      load(id) {
        if ([baseId, currentId].includes(id))
          return (
            (id === baseId ? base : current) +
            (id === currentId && process.env.REGISTRATION_PROOF_DROP_COMPONENT
              ? "\ndelete components[Object.keys(components)[0]];"
              : "") +
            (id === currentId && process.env.REGISTRATION_PROOF_REVERSE_ORDER
              ? "\nconst originalSortedEntries = sortedEntries; sortedEntries = loaders => originalSortedEntries(loaders).reverse();"
              : "") +
            "\nexport const registryMaps = { components, customPages, dynamicPages, layouts, errorPages };"
          );
        if (id === "\0registry-sdk")
          return "export const useDmsRuntimeConfig = () => ({ public: { dms: {} } });";
        if (id.startsWith("\0registry-component:")) {
          const target = id.slice("\0registry-component:".length);
          return `export default { target: ${JSON.stringify(renamed.get(target) ?? target)} };`;
        }
        if (id.startsWith("\0registry-inert:"))
          return `function plugin() {} plugin.registryId = ${JSON.stringify(id)}; export default plugin;`;
      },
    },
  ],
});
/**
 * A module as the observer plugin loads it: the layer's registration function and the maps it fills.
 *
 * @typedef {object} RegistryModule
 * @property {{ setup: (sdk: object) => unknown }} default
 * @property {Record<string, Record<string, () => unknown>>} registryMaps
 */

/**
 * @param {unknown} value
 * @returns {value is Record<string, unknown>}
 */
function isRecord(value) {
  return typeof value === "object" && value !== null;
}

/**
 * @param {unknown} value
 * @returns {value is () => unknown}
 */
function isLoader(value) {
  return typeof value === "function";
}

/**
 * @param {unknown} value
 * @returns {value is Record<string, () => unknown>}
 */
function isLoaderMap(value) {
  return isRecord(value) && Object.values(value).every(isLoader);
}

/**
 * @param {unknown} value
 * @returns {value is RegistryModule}
 */
function isRegistryModule(value) {
  return (
    isRecord(value) &&
    isRecord(value.default) &&
    typeof value.default.setup === "function" &&
    isRecord(value.registryMaps) &&
    Object.values(value.registryMaps).every(isLoaderMap)
  );
}

/**
 * @param {unknown} value
 * @returns {value is { default: { target: unknown } }}
 */
function hasTarget(value) {
  return (
    isRecord(value) &&
    isRecord(value.default) &&
    Object.hasOwn(value.default, "target")
  );
}

/**
 * @param {unknown} value
 * @returns {value is ((...args: never[]) => unknown) & { registryId?: unknown }}
 */
function isFunction(value) {
  return z.function().safeParse(value).success;
}

/**
 * @param {string} id
 * @returns {Promise<RegistryModule>}
 */
async function loadRegistry(id) {
  /** @type {unknown} */
  const module = await server.ssrLoadModule(id);
  if (!isRegistryModule(module))
    throw new Error(`${id} exports no registration setup and registry maps`);
  return module;
}

/**
 * @param {RegistryModule} module
 * @returns {Promise<{ events: unknown[][], maps: Record<string, [string, unknown][]> }>}
 */
async function registration(module) {
  /** @type {unknown[][]} */
  const events = [];
  /** @type {Record<string | symbol, unknown>} */
  const target = { options: { public: {} } };
  const sdk = new Proxy(target, {
    get(target, name) {
      if (name in target) return target[name];
      return (/** @type {unknown[]} */ ...args) =>
        events.push([
          name,
          ...args.map((value) => {
            if (isFunction(value))
              return {
                function: value.name,
                arity: value.length,
                importedModule: value.registryId,
              };
            return isRecord(value) && value.__asyncLoader
              ? { kind: "async-component" }
              : value;
          }),
        ]);
    },
  });
  module.default.setup(sdk);
  /** @type {Record<string, [string, unknown][]>} */
  const maps = {};
  for (const [name, entries] of Object.entries(module.registryMaps)) {
    maps[name] = [];
    for (const [key, load] of Object.entries(entries).sort(([a], [b]) =>
      a.localeCompare(b),
    )) {
      const loaded = await load();
      if (!hasTarget(loaded))
        throw new Error(`${key} loads no default export with a target`);
      maps[name].push([key, loaded.default.target]);
    }
  }
  return { events, maps };
}
try {
  const before = await registration(await loadRegistry(baseId));
  const after = await registration(await loadRegistry(currentId));
  assert.deepEqual(
    after.maps,
    before.maps,
    "Vite-expanded registration keys and loader targets",
  );
  assert.deepEqual(
    after.events,
    before.events,
    "complete setup registration names, order, aliases and options",
  );
  assert(
    !after.maps.components.some(
      ([key]) =>
        key.endsWith("/table/TableBody.vue") ||
        key.endsWith("/ImagePresentation.vue"),
    ),
  );
  if (process.env.REGISTRATION_PROOF_OUTPUT)
    writeFileSync(
      process.env.REGISTRATION_PROOF_OUTPUT,
      JSON.stringify(
        { before, after, identicalFileRenames: [...renamed] },
        null,
        2,
      ),
    );
  console.log(
    `PASS Vite registration parity against ${baseRef} (${after.maps.components.length} component loaders; ${after.events.length} registration events)`,
  );
} finally {
  await server.close();
}
