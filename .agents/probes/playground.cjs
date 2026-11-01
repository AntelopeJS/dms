const { execFileSync } = require("node:child_process");
const { existsSync, readFileSync } = require("node:fs");
const { createRequire, Module } = require("node:module");
const { join } = require("node:path");

/** Orders strings by UTF-16 code unit, the order `sort()` uses with no comparator. */
function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

const root = process.argv[2];
const playground = join(root, "packages/dms/playground");
execFileSync("pnpm", ["--dir", playground, "exec", "tsc"], {
  cwd: root,
  stdio: "pipe",
});

const NativeDate = Date;
global.Date = class extends NativeDate {
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

const virtualLeaves = {};
const capture = Symbol.for("playground-probe.capture");
global[capture] = (name, entries) => {
  const exports = {};
  Object.defineProperty(exports, "__esModule", { value: true });
  for (const [key, value] of entries) exports[key] = value;
  virtualLeaves[name] = exports;
};

const extension = Module._extensions[".js"];
Module._extensions[".js"] = (module, filename) => {
  const additions = Object.entries(leaves).filter(
    ([name, [owner]]) =>
      filename === join(playground, "dist", owner + ".js") &&
      !existsSync(join(playground, "dist", name + ".js")),
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

const local = createRequire(join(playground, "package.json"));
const core = local("@antelopejs/interface-core");
const { RunWithModuleContext } = local("@antelopejs/interface-core/modules");
const registrations = [];
const load = Module._load;
Module._load = function (request, parent, main) {
  const result = load.call(this, request, parent, main);
  if (request === "@antelopejs/interface-dms/page")
    return {
      ...result,
      RegisterPage:
        (...args) =>
        (target) => {
          registrations.push([
            "page",
            target.name,
            core.GetMetadata(target, result.PageMetadata).pageInfo,
            Object.entries(target).map(([key, value]) => [
              key,
              value?.serializeSync?.() ?? value,
            ]),
          ]);
          result.RegisterPage(...args)(target);
        },
    };
  if (request === "@antelopejs/interface-database-decorators")
    return {
      ...result,
      RegisterTable:
        (...args) =>
        (target) => {
          registrations.push(["table", target.name, args]);
          result.RegisterTable(...args)(target);
        },
    };
  return result;
};

RunWithModuleContext({ module: "playground-probe" }, () =>
  local(join(playground, "dist/index.js")),
);

const dataModules = [
  "feature-index/blocks",
  "feature-index/table-view",
  "table-view/defaultValues",
];
const data = Object.fromEntries(
  dataModules.map((name) => {
    const exports = require(join(playground, "dist", name + ".js"));
    if (exports !== require(join(playground, "dist", name + ".js")))
      throw new Error("Module cache identity changed");
    return [name, descriptors(exports)];
  }),
);
const catalog = require(
  join(playground, "dist/feature-index/catalog.js"),
).PLAYGROUND_FEATURES;
const blocks = require(
  join(playground, "dist/feature-index/blocks.js"),
).BLOCKS_FEATURES;
const tables = require(
  join(playground, "dist/feature-index/table-view.js"),
).TABLE_VIEW_FEATURES;
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
          virtualLeaves[name] ?? local(join(playground, "dist", name + ".js")),
        ),
      ]),
  ),
);
const blocksRegistered = local(
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
