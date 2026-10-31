const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { createRequire, Module } = require("node:module");
const path = require("node:path");

/** Orders strings by UTF-16 code unit, the order `sort()` uses with no comparator.
 * @param {string} left
 * @param {string} right
 */
function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

const root = process.argv[2];
const playground = path.join(root, "packages/dms/playground");
execFileSync("pnpm", ["--dir", playground, "exec", "tsc"], {
  cwd: root,
  stdio: "pipe",
});

const NativeDate = Date;
global.Date = class extends NativeDate {
  /** @param {ConstructorParameters<typeof Date>} args */
  constructor(...args) {
    super(...(args.length ? args : ["2026-10-26T12:00:00.000Z"]));
  }
  static now() {
    return new NativeDate("2026-10-26T12:00:00.000Z").getTime();
  }
};

let randomState = 1;
Math.random = () => {
  randomState = (Math.imul(randomState, 1664525) + 1013904223) >>> 0;
  return randomState / 2 ** 32;
};

/**
 * @param {unknown} value
 * @param {Set<unknown>} [ancestors]
 * @returns {unknown}
 */
function snapshot(value, ancestors = new Set()) {
  if (value === undefined) return { type: "undefined" };
  if (typeof value === "function")
    return {
      type: "function",
      name: value.name,
      length: value.length,
      async: value.constructor.name === "AsyncFunction",
    };
  if (typeof value === "symbol") return String(value);
  if (value instanceof NativeDate)
    return { type: "Date", milliseconds: value.getTime() };
  if (value !== null && typeof value === "object") {
    if (ancestors.has(value)) return { type: "circular" };
    const next = new Set(ancestors).add(value);
    if (Array.isArray(value)) return value.map((item) => snapshot(item, next));
    return Object.entries(value).map(([key, item]) => [
      key,
      snapshot(item, next),
    ]);
  }
  return value;
}

/**
 * @param {Record<string, unknown>} value
 */
function descriptors(value) {
  return Object.entries(Object.getOwnPropertyDescriptors(value)).map(
    ([key, descriptor]) => [
      key,
      {
        writable: descriptor.writable,
        enumerable: descriptor.enumerable,
        configurable: descriptor.configurable,
        get: snapshot(descriptor.get),
        set: snapshot(descriptor.set),
        value: snapshot("value" in descriptor ? descriptor.value : value[key]),
      },
    ],
  );
}

const leaves = {
  "feature-index/blocks-charts": [
    "feature-index/blocks",
    "CHART_TYPE_FEATURES CHART_OPTION_FEATURES CARD_FEATURES PERIOD_FEATURES",
  ],
  "feature-index/blocks-content": [
    "feature-index/blocks",
    "STAT_GROUP_FEATURES KEY_VALUE_FEATURES NAV_CARD_FEATURES ACTIVITY_FEATURES METER_FEATURES BANNER_FEATURES",
  ],
  "feature-index/blocks-data": [
    "feature-index/blocks",
    "STAT_GROUP KEY_VALUE NAV_CARDS FEEDBACK ACTIVITY METERS SETTINGS CODE GUARD LIVE PAGE_TOOLBAR PAGE_TOOLBAR_REPORT RECORD CATALOG CHART_DASHBOARD CHART_XY CHART_CIRCULAR CHART_REALTIME CHART_ADVANCED CHART_OPTIONS CHART_CARDS CHART_TOP_LIST CHART_PERIOD CHART_METRICS CHART_STATIC CHART_SCOPES GRID_SIMPLE GRID_STACKED GRID_HYBRID GRID_SPACER GRID_DENSE HSTACK VSTACK SPACER STACK_COMBINED TABS_BASIC TABS_COUNTS TABS_KEEP_ALIVE TABS_PERSIST TABS_VARIANTS MULTI_COMPONENT feature",
  ],
  "feature-index/blocks-foundations": [
    "feature-index/blocks",
    "PLUMBING PERIOD_AND_REALTIME COMPOSED_TEXTS LIVE_FEATURES REGISTRY_FEATURES",
  ],
  "feature-index/blocks-layout": [
    "feature-index/blocks",
    "CONTAINER_FEATURES EMPTY_AND_CODE_FEATURES GUARD_FEATURES LAYOUT_FEATURES TAB_FEATURES",
  ],
  "feature-index/table-view-actions": [
    "feature-index/table-view",
    "ROW_ACTIONS",
  ],
  "feature-index/table-view-data": [
    "feature-index/table-view",
    "V2_DESIGN SUBLINES SOURCE_TOKENS CARD_REORDER COLUMN_HIDDEN SIDE_PANEL CARD_ACTIONS REQUEST_LOG_GAPS PAGE_TOKENS VISIBLE_QUERY_FILTERS URL_TAB_FOLLOW DOWNLOAD_TARGET LATEST PAGES BY_STATUS_SLUG feature",
  ],
  "feature-index/table-view-displays": [
    "feature-index/table-view",
    "DISPLAYS_AND_CARDS CELLS SOURCES DATA_AND_TENANCY",
  ],
  "feature-index/table-view-layout": [
    "feature-index/table-view",
    "FORMS_AND_CONTAINERS LAYOUT_AND_PAGING FILTERS_TABS_VIEWS EMPTY_STATES_AND_REALTIME",
  ],
  "table-view/random-descriptions": [
    "table-view/defaultValues",
    "RANDOM_DESCRIPTIONS",
  ],
  "table-view/random-names": ["table-view/defaultValues", "RANDOM_NAMES"],
  "table-view/random-task-names": [
    "table-view/defaultValues",
    "RANDOM_TASK_NAMES",
  ],
  "table-view/sample-addresses": [
    "table-view/defaultValues",
    "SAMPLE_ADDRESSES",
  ],
};

/** @type {Record<string, Record<string, unknown>>} */
const virtualLeaves = {};
const capture = Symbol.for("playground-probe.capture");
global[capture] = (/** @type {string} */ name, /** @type {[string, unknown][]} */ entries) => {
  /** @type {Record<string, unknown>} */
  const exports = {};
  Object.defineProperty(exports, "__esModule", { value: true });
  for (const [key, value] of entries) exports[key] = value;
  virtualLeaves[name] = exports;
};

const extension = Module._extensions[".js"];
Module._extensions[".js"] = (module, filename) => {
  const additions = Object.entries(leaves).filter(
    ([name, [owner]]) =>
      filename === path.join(playground, "dist", owner + ".js") &&
      !existsSync(path.join(playground, "dist", name + ".js")),
  );
  if (!additions.length) return extension(module, filename);
  const captures = additions
    .map(
      ([name, [, names]]) =>
        `global[Symbol.for("playground-probe.capture")](${JSON.stringify(name)}, [${names
          .split(" ")
          .map((key) => `[${JSON.stringify(key)}, ${key}]`)
          .join(",")}]);`,
    )
    .join("\n");
  module._compile(readFileSync(filename, "utf8") + "\n" + captures, filename);
};

const local = createRequire(path.join(playground, "package.json"));

/**
 * @typedef {{
 *   "@antelopejs/interface-core": typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-core");
 *   "@antelopejs/interface-core/modules": typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-core/dist/modules.js");
 *   "@antelopejs/interface-dms/base/block-types": typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-dms/dist/base/block-types.js");
 * }} PlaygroundPackages
 */

/**
 * The one place this probe reads the playground's installed interface packages, typed by the declarations they ship.
 * @template {keyof PlaygroundPackages} Name
 * @param {Name} name
 * @returns {PlaygroundPackages[Name]}
 */
function loadPackage(name) {
  return local(name);
}

/**
 * The one place this probe reads the playground's built output; the modules it inspects are opaque records of exports.
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function loadBuilt(file) {
  return local(path.join(playground, "dist", file));
}

const core = loadPackage("@antelopejs/interface-core");
const { RunWithModuleContext } = loadPackage("@antelopejs/interface-core/modules");
/**
 * @param {unknown} value
 * @returns {unknown}
 */
function serializedWhenAble(value) {
  if (value instanceof Object && "serializeSync" in value && value.serializeSync instanceof Function) {
    return value.serializeSync() ?? value;
  }
  return value;
}

/** @type {unknown[]} */
const registrations = [];
/**
 * @typedef {{
 *   "@antelopejs/interface-dms/page": typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-dms/dist/page.js");
 *   "@antelopejs/interface-database-decorators": typeof import("../../packages/dms/playground/node_modules/@antelopejs/interface-database-decorators");
 * }} PatchedPackages
 */

/**
 * The one place this probe reads `Module._load`, which @types/node omits: it answers the two packages the probe patches with their declared exports and any other request with whatever that module exports.
 * @type {<Request extends string>(request: Request, parent: Module | null | undefined, isMain: boolean) => Request extends keyof PatchedPackages ? PatchedPackages[Request] : unknown}
 */
const load = Module._load;
/**
 * @param {string} request
 * @param {Module | null | undefined} parent
 * @param {boolean} main
 */
Module._load = function (request, parent, main) {
  if (request === "@antelopejs/interface-dms/page") {
    const result = load(request, parent, main);
    return {
      ...result,
      RegisterPage:
        (/** @type {Parameters<typeof result.RegisterPage>} */ ...args) =>
        (/** @type {Parameters<ReturnType<typeof result.RegisterPage>>[0]} */ target) => {
          registrations.push([
            "page",
            target.name,
            core.GetMetadata(target, result.PageMetadata).pageInfo,
            Object.entries(target).map(([key, value]) => [key, serializedWhenAble(value)]),
          ]);
          result.RegisterPage(...args)(target);
        },
    };
  }
  if (request === "@antelopejs/interface-database-decorators") {
    const result = load(request, parent, main);
    return {
      ...result,
      RegisterTable:
        (/** @type {Parameters<typeof result.RegisterTable>} */ ...args) =>
        (/** @type {Parameters<ReturnType<typeof result.RegisterTable>>[0]} */ target) => {
          registrations.push(["table", target.name, args]);
          result.RegisterTable(...args)(target);
        },
    };
  }
  return load(request, parent, main);
};

RunWithModuleContext({ module: "playground-probe" }, () =>
  loadBuilt("index.js"),
);

const dataModules = [
  "feature-index/blocks",
  "feature-index/table-view",
  "table-view/defaultValues",
];
const data = Object.fromEntries(
  dataModules.map((name) => {
    const exports = loadBuilt(name + ".js");
    if (exports !== loadBuilt(name + ".js"))
      throw new Error("Module cache identity changed");
    return [name, descriptors(exports)];
  }),
);
/**
 * @param {string} file
 * @param {string} name
 * @returns {unknown[]}
 */
function builtList(file, name) {
  const value = loadBuilt(file)[name];
  if (!Array.isArray(value)) throw new TypeError(`${file} does not export a list named ${name}`);
  return value;
}

const catalog = builtList("feature-index/catalog.js", "PLAYGROUND_FEATURES");
const blocks = builtList("feature-index/blocks.js", "BLOCKS_FEATURES");
const tables = builtList("feature-index/table-view.js", "TABLE_VIEW_FEATURES");
for (const [index, item] of [...blocks, ...tables].entries()) {
  if (catalog[index] !== item)
    throw new Error("Catalog no longer shares feature objects");
}
data.catalog = snapshot(catalog);

const files = execFileSync(
  "git",
  ["ls-files", "--", "packages/dms/playground/src"],
  { cwd: root, encoding: "utf8" },
)
  .trim()
  .split("\n");
const names = new Set([
  ...files
    .filter((file) => file.endsWith(".ts"))
    .map((file) =>
      file.replace("packages/dms/playground/src/", "").replace(/\.ts$/, ""),
    ),
  ...Object.keys(leaves),
]);
const modules = RunWithModuleContext({ module: "playground-probe" }, () =>
  Object.fromEntries(
    [...names]
      .sort(byCodeUnit)
      .map((name) => [
        name,
        descriptors(
          virtualLeaves[name] ?? loadBuilt(name + ".js"),
        ),
      ]),
  ),
);
const blocksRegistered = loadPackage(
  "@antelopejs/interface-dms/base/block-types",
).ListBlockTypes();
process.stdout.write(
  JSON.stringify({
    data,
    registrations: snapshot(registrations),
    blocksRegistered: snapshot(blocksRegistered),
    modules,
  }),
);
