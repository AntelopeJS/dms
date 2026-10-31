const fs = require("node:fs");
const os = require("node:os");
const nodePath = require("node:path");
const { sep } = nodePath;

/** Orders strings by UTF-16 code unit, the order `sort()` uses with no comparator.
 * @param {string} left
 * @param {string} right
 */
function byCodeUnit(left, right) {
  if (left < right) return -1;
  return left > right ? 1 : 0;
}

const root = process.argv[2];
const report = process.env.INTERFACE_DMS_LAYERS_REPORT === "1";
const packageRoot = nodePath.join(root, "packages/interface-dms");
const realDist = nodePath.join(packageRoot, "dist");

/** @type {Array<[oldEntry: string, names: string[], newEntry: string]>} */
const MOVED = [
  ["base/types/watch.js", ["ComponentId"], "watch-actions.js"],
  ["base/types/tone.js", ["TONES"], "tones.js"],
  ["base/types/export-status.js", ["ExportStatus"], "export-status.js"],
  ["base/types/button.js", ["ButtonVariant"], "component-options/button.js"],
  [
    "base/types/row-action-operators.js",
    ["FIELD_OPERATORS"],
    "component-options/row-action.js",
  ],
  [
    "base/data-types/core.js",
    [
      "DataType",
      "RegisterDataType",
      "RegisterDataCompareMode",
      "CreateDataType",
      "getDataTypeId",
      "serializeType",
    ],
    "component-options/data-type.js",
  ],
  [
    "base/confirm-dialog.js",
    ["serializeConfirmDialog"],
    "component-options/confirm-dialog.js",
  ],
  [
    "base/internal/confirm-dialog.js",
    ["isConfirmFrom", "serializeActionConfirm"],
    "component-options/internal/confirm-dialog.js",
  ],
  [
    "base/types/internal/action-target.js",
    ["serializeActionTarget"],
    "component-options/internal/action-target.js",
  ],
  [
    "base/internal/form-schema.js",
    ["serializeFormField"],
    "component-options/internal/form-field.js",
  ],
  [
    "base/layouts.js",
    ["DefaultLayout", "FormPageLayout", "SettingsLayout", "EmptyLayout"],
    "component-options/page-layout.js",
  ],
  [
    "base/internal/button-availability.js",
    ["applyButtonAvailability"],
    "component-options/internal/button-availability.js",
  ],
  [
    "base/table-view/internal/options.js",
    ["TABLE_VIEW_COMPONENT_NAME"],
    "component-options/internal/page-layout.js",
  ],
];

const NEW_MODULES = new Set([
  "component-options/action-target.js",
  "component-options/button.js",
  "component-options/confirm-dialog.js",
  "component-options/data-type.js",
  "component-options/form-field.js",
  "component-options/internal/button-availability.js",
  "component-options/internal/form-field.js",
  "component-options/internal/page-layout.js",
  "component-options/internal/action-target.js",
  "component-options/internal/confirm-dialog.js",
  "component-options/page-layout.js",
  "component-options/row-action.js",
  "export-status.js",
  "invite-extension-payloads.js",
  "tones.js",
  "watch-actions.js",
]);

const MOVED_FROM = new Map(Object.entries({
  "component-options/data-type.js": "base/data-types/core.js",
  "component-options/page-layout.js": "base/layouts.js",
  "component-options/confirm-dialog.js": "base/confirm-dialog.js",
  "component-options/internal/confirm-dialog.js":
    "base/internal/confirm-dialog.js",
  "component-options/internal/action-target.js":
    "base/types/internal/action-target.js",
  "component-options/internal/form-field.js": "base/internal/form-schema.js",
  "component-options/internal/button-availability.js":
    "base/internal/button-availability.js",
  "component-options/internal/page-layout.js":
    "base/table-view/internal/options.js",
  "component-options/row-action.js": "base/types/row-action-operators.js",
  "component-options/button.js": "base/types/button.js",
  "export-status.js": "base/types/export-status.js",
  "tones.js": "base/types/tone.js",
  "watch-actions.js": "base/types/watch.js",
}));

const ISOLATED = [
  "index.js",
  "auth/index.js",
  "auth/db/index.js",
  "auth/db/models/index.js",
  "auth/db/tables/index.js",
  "base/index.js",
  "base/block-registry/index.js",
  "base/data-types/index.js",
  "base/types/index.js",
  "data-controllers/index.js",
  "db/index.js",
  "db/models/index.js",
  "db/tables/index.js",
  "html-render/index.js",
  "notifications/index.js",
  "page.js",
  "component.js",
  "component-slots.js",
  "guards.js",
  "hooks.js",
  "invites.js",
  "invite-resolution.js",
  "invite-extensions.js",
  "layout-banners.js",
  "permission-gate.js",
  "permissions.js",
  "quick-actions.js",
  "tenant-ownership.js",
  "base/confirm-dialog.js",
  "base/data-types/core.js",
  "base/form-types.js",
  "base/internal/button-availability.js",
  "base/internal/confirm-dialog.js",
  "base/internal/form-schema.js",
  "base/internal/layouts.js",
  "base/layouts.js",
  "base/table-view/internal/options.js",
  "base/types/action-target.js",
  "base/types/button.js",
  "base/types/confirm-dialog.js",
  "base/types/custom-button.js",
  "base/types/export-status.js",
  "base/types/form-values.js",
  "base/types/internal/action-target.js",
  "base/types/row-action-operators.js",
  "base/types/row-action.js",
  "base/types/size.js",
  "base/types/tone.js",
  "base/types/watch.js",
  "db/internal/exportJobs.model.js",
  "db/tables/exportJobs.table.js",
  "db/tables/user_invites.table.js",
  "internal/component-watches.js",
  "invite-extensions/types.js",
  "page/internal/layout-filter.js",
  "page/internal/metadata-info.js",
  "page/internal/nav-badges.js",
  "page/internal/page-record.js",
  "page/internal/table-view-ids.js",
  "page/layout-filter.js",
  "page/roots.js",
  "page/types.js",
];

/** @type {Map<unknown, unknown>["set"]} */
const originalMapSet = Map.prototype.set;
/** @type {Map<unknown, unknown>["has"]} */
const originalMapHas = Map.prototype.has;
/** @type {WeakMap<object, unknown>["set"]} */
const originalWeakMapSet = WeakMap.prototype.set;
/** @type {WeakMap<object, unknown>["has"]} */
const originalWeakMapHas = WeakMap.prototype.has;
/** @type {WeakMap<object, string | null>["get"]} */
const originalWeakMapGet = WeakMap.prototype.get;
/** @type {Set<unknown>["add"]} */
const originalSetAdd = Set.prototype.add;
/** @type {Set<unknown>["has"]} */
const originalSetHas = Set.prototype.has;

/**
 * @typedef {{
 *   distRoot: string;
 *   labels: WeakMap<object, string | null>;
 *   ordinals: Map<string, number>;
 *   inserts: Map<string, string[]>;
 * }} Recording
 */

/** @type {Recording | undefined} */
let recording;
let inside = false;

/**
 * @param {unknown} key
 * @returns {string}
 */
function describeKey(key) {
  if (typeof key === "string" || typeof key === "number") return String(key);
  if (typeof key === "symbol") return key.toString();
  if (typeof key === "function") return `fn:${key.name || "anonymous"}`;
  if (key === null || typeof key !== "object") return String(key);
  const tag = Reflect.getPrototypeOf(key)?.constructor?.name ?? "null";
  for (const field of ["id", "name", "key"]) {
    const own = Object.getOwnPropertyDescriptor(key, field);
    if (own && "value" in own && typeof own.value === "string") {
      return `obj:${tag}:${own.value}`;
    }
  }
  return `obj:${tag}`;
}

/**
 * @param {Recording} recording
 * @param {object} container
 * @returns {string | null}
 */
function containerLabel(recording, container) {
  if (originalWeakMapHas.call(recording.labels, container)) {
    return originalWeakMapGet.call(recording.labels, container);
  }
  const limit = Error.stackTraceLimit;
  Error.stackTraceLimit = 80;
  const stack = new Error().stack ?? "";
  Error.stackTraceLimit = limit;
  const prefix = recording.distRoot + sep;
  /** @type {string | undefined} */
  let file;
  for (const line of stack.split("\n").slice(1)) {
    const at = line.indexOf(prefix);
    if (at === -1) continue;
    const rest = line.slice(at + prefix.length);
    file = rest.slice(0, rest.indexOf(".js:") + 3).split(sep).join("/");
    break;
  }
  let label = null;
  if (file) {
    const canonical = MOVED_FROM.get(file) ?? file;
    const ordinal = (recording.ordinals.get(canonical) ?? 0) + 1;
    originalMapSet.call(recording.ordinals, canonical, ordinal);
    label = `${canonical}#${ordinal}`;
  }
  originalWeakMapSet.call(recording.labels, container, label);
  return label;
}

/**
 * @param {object} container
 * @param {unknown} key
 * @param {boolean} isNew
 */
function record(container, key, isNew) {
  if (!recording || inside || !isNew) return;
  inside = true;
  try {
    const label = containerLabel(recording, container);
    if (label) {
      const list = recording.inserts.get(label) ?? [];
      list.push(describeKey(key));
      originalMapSet.call(recording.inserts, label, list);
    }
  } finally {
    inside = false;
  }
}

Map.prototype.set = function set(key, value) {
  record(this, key, !originalMapHas.call(this, key));
  return originalMapSet.call(this, key, value);
};
WeakMap.prototype.set = function set(key, value) {
  record(this, key, !originalWeakMapHas.call(this, key));
  return originalWeakMapSet.call(this, key, value);
};
Set.prototype.add = function add(value) {
  record(this, value, !originalSetHas.call(this, value));
  return originalSetAdd.call(this, value);
};

function clearCache() {
  for (const key of Object.keys(require.cache)) delete require.cache[key];
}

function globalsSnapshot() {
  return {
    globals: Reflect.ownKeys(globalThis).map(String),
    listeners: process
      .eventNames()
      .map((name) => `${String(name)}:${process.listenerCount(name)}`),
  };
}

/**
 * The one place this probe reads a module out of a dist tree: the modules are inspected as opaque records of exports.
 * @param {string} distRoot
 * @param {string} entry
 * @returns {Record<string, unknown>}
 */
function loadDist(distRoot, entry) {
  return require(nodePath.join(distRoot, entry));
}

/**
 * @param {string} distRoot
 * @param {string} entry
 */
function loadAlone(distRoot, entry) {
  clearCache();
  const before = globalsSnapshot();
  recording = {
    distRoot,
    labels: new WeakMap(),
    ordinals: new Map(),
    inserts: new Map(),
  };
  /** @type {string | undefined} */
  let error;
  try {
    loadDist(distRoot, entry);
  } catch (caught) {
    error = String(caught && caught.message);
  }
  const { inserts } = recording;
  recording = undefined;
  const after = globalsSnapshot();
  const registries = Object.fromEntries(
    [...inserts].sort(([a], [b]) => a.localeCompare(b)),
  );
  const loadSet = Object.keys(require.cache)
    .map((file) =>
      file.startsWith(distRoot + sep)
        ? nodePath.relative(distRoot, file).split(sep).join("/")
        : `npm:${file.slice(file.lastIndexOf(`node_modules${sep}`) + 13)}`,
    )
    .sort(byCodeUnit);
  return {
    error,
    registries,
    globalsAdded: after.globals.filter((key) => !before.globals.includes(key)),
    listenersChanged: after.listeners.filter(
      (entry) => !before.listeners.includes(entry),
    ),
    loadSet,
  };
}

/**
 * @param {object} exportsObject
 * @returns {string[]}
 */
function describeExports(exportsObject) {
  return Reflect.ownKeys(exportsObject).map((key) => {
    const d = Object.getOwnPropertyDescriptor(exportsObject, key);
    const flags = `${d.enumerable ? "e" : "-"}${d.configurable ? "c" : "-"}`;
    if (!("value" in d)) return `${String(key)} accessor ${flags}`;
    /** @type {unknown} */
    const value = d.value;
    const type =
      typeof value === "function"
        ? `function ${value.name}/${value.length}`
        : value === null
          ? "null"
          : typeof value;
    return `${String(key)} data ${flags}${d.writable ? "w" : "-"} ${type}`;
  });
}

/**
 * @param {string} distRoot
 * @returns {string[]}
 */
function listEntries(distRoot) {
  /** @type {string[]} */
  const files = [];
  (function walk(/** @type {string} */ directory) {
    for (const item of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = nodePath.join(directory, item.name);
      if (item.isDirectory()) walk(full);
      else if (item.name.endsWith(".js")) {
        files.push(nodePath.relative(distRoot, full).split(sep).join("/"));
      }
    }
  })(distRoot);
  return files.filter((file) => !NEW_MODULES.has(file)).sort(byCodeUnit);
}

/**
 * @param {string} distRoot
 * @returns {Record<string, string[]>}
 */
function observeExports(distRoot) {
  clearCache();
  loadDist(distRoot, "index.js");
  /** @type {Record<string, string[]>} */
  const entries = {};
  for (const entry of listEntries(distRoot)) {
    entries[entry] = describeExports(loadDist(distRoot, entry));
  }
  return entries;
}

/**
 * @param {string} distRoot
 */
function observeIdentity(distRoot) {
  clearCache();
  loadDist(distRoot, "index.js");
  const all = listEntries(distRoot).map((entry) => /** @type {const} */ ([
    entry,
    loadDist(distRoot, entry),
  ]));
  /** @type {{ old: string, type: string, aliases: string[], newPathSameObject: boolean }[]} */
  const result = [];
  for (const [oldEntry, names, newEntry] of MOVED) {
    const oldModule = loadDist(distRoot, oldEntry);
    const newFile = nodePath.join(distRoot, newEntry);
    const newModule = fs.existsSync(newFile) ? loadDist(distRoot, newEntry) : undefined;
    for (const name of names) {
      const value = oldModule[name];
      const aliases = all
        .filter(([, exported]) => Object.hasOwn(exported, name))
        .map(([entry, exported]) => `${entry}:${exported[name] === value}`);
      result.push({
        old: `${oldEntry}#${name}`,
        type: typeof value,
        aliases,
        newPathSameObject: newModule === undefined || newModule[name] === value,
      });
    }
  }
  return result;
}

/**
 * @param {string} distRoot
 */
function observeIsolated(distRoot) {
  /** @type {Record<string, unknown>} */
  const result = {};
  for (const entry of ISOLATED) {
    const { loadSet, ...observed } = loadAlone(distRoot, entry);
    result[entry] = report ? { ...observed, loadSet } : observed;
  }
  return result;
}

/**
 * @template Observation
 * @param {(distRoot: string) => Observation} run
 * @returns {Observation}
 */
function withScratchCopy(run) {
  const scratch = fs.mkdtempSync(nodePath.join(os.tmpdir(), "interface-dms-layers-"));
  try {
    const scratchPackage = nodePath.join(scratch, "packages/interface-dms");
    fs.mkdirSync(scratchPackage, { recursive: true });
    fs.cpSync(realDist, nodePath.join(scratchPackage, "dist"), {
      recursive: true,
      filter: (path) => !path.endsWith(".map") && !path.endsWith(".d.ts"),
    });
    fs.copyFileSync(
      nodePath.join(packageRoot, "package.json"),
      nodePath.join(scratchPackage, "package.json"),
    );
    fs.symlinkSync(
      nodePath.join(packageRoot, "node_modules"),
      nodePath.join(scratchPackage, "node_modules"),
      "dir",
    );
    fs.symlinkSync(nodePath.join(root, "node_modules"), nodePath.join(scratch, "node_modules"), "dir");
    return run(nodePath.join(scratchPackage, "dist"));
  } finally {
    clearCache();
    fs.rmSync(scratch, { recursive: true, force: true });
  }
}

/**
 * @param {string} distRoot
 * @param {string} file
 * @param {(code: string) => string} edit
 * @param {() => unknown} observe
 * @returns {boolean}
 */
function mutated(distRoot, file, edit, observe) {
  const path = nodePath.join(distRoot, file);
  const original = fs.readFileSync(path, "utf8");
  const before = JSON.stringify(observe());
  fs.writeFileSync(path, edit(original));
  try {
    return JSON.stringify(observe()) !== before;
  } finally {
    fs.writeFileSync(path, original);
  }
}

function negativeControls() {
  return withScratchCopy((distRoot) => ({
    registryOrderDetected: mutated(
      distRoot,
      "base/data-types/default-types.js",
      (code) =>
        code.replace('"use strict";', '"use strict";\nrequire("./default/files");'),
      () => loadAlone(distRoot, "base/data-types/index.js").registries,
    ),
    descriptorDetected: mutated(
      distRoot,
      "base/layouts.js",
      (code) =>
        `${code}\n{ const kept = exports.DefaultLayout; Object.defineProperty(exports, "DefaultLayout", { enumerable: true, configurable: true, get: () => kept }); }\n`,
      () => observeExports(distRoot)["base/layouts.js"],
    ),
    identityDetected: mutated(
      distRoot,
      "base/types/index.js",
      (code) =>
        code.replace(
          '__exportStar(require("./watch"), exports);',
          'Object.defineProperty(exports, "ComponentId", { enumerable: true, value: { ...require("./watch").ComponentId } });\n__exportStar(require("./watch"), exports);',
        ),
      () => observeIdentity(distRoot),
    ),
    loadSideEffectDetected: mutated(
      distRoot,
      "page/roots.js",
      (code) => `${code}\nrequire("../base/data-types");\n`,
      () => loadAlone(distRoot, "page.js").registries,
    ),
  }));
}

const observations = {
  exports: observeExports(realDist),
  movedValues: observeIdentity(realDist),
  isolated: observeIsolated(realDist),
  negativeControls: negativeControls(),
};
process.stdout.write(JSON.stringify(observations));
