"use strict";

const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const nodePath = require("node:path");
const { sep } = nodePath;
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");
const { baselineContract } = require("./backend-runtime-contract.cjs");

const root = nodePath.resolve(process.argv[2]);
const load = createRequire(nodePath.join(root, "packages/dms/package.json"));

/**
 * @typedef {{
 *   "@antelopejs/interface-core": typeof import("../../packages/dms/node_modules/@antelopejs/interface-core");
 *   "@antelopejs/interface-dms/page": typeof import("../../packages/dms/node_modules/@antelopejs/interface-dms/dist/page.js");
 *   "@antelopejs/interface-file-storage": typeof import("../../packages/dms/node_modules/@antelopejs/interface-file-storage");
 *   "./dist/implementations/dms/page.js": typeof import("../../packages/dms/src/implementations/dms/page");
 *   "./dist/implementations/dms-base/footer-summary.js": typeof import("../../packages/dms/src/implementations/dms-base/footer-summary");
 *   "./dist/utils/export-jobs.js": typeof import("../../packages/dms/src/utils/export-jobs");
 * }} DmsModules
 */

/**
 * The one place this probe reads named modules of the dms package and its dependencies, typed by the declarations they ship.
 * @template {keyof DmsModules} Entry
 * @param {Entry} entry
 * @returns {DmsModules[Entry]}
 */
function loadDms(entry) {
  return load(entry);
}

/**
 * The one place this probe reads a built module it only inspects: the exports are an opaque record.
 * @param {string} file
 * @returns {Record<string, unknown>}
 */
function loadExports(file) {
  return load(file);
}

if (process.argv[3] === "--observe") {
  writeFileSync(1, JSON.stringify(observeRuntime()) + "\n");
  process.exit(0);
}

const fresh = spawnSync(process.execPath, [__filename, root, "--observe"], {
  cwd: root,
  encoding: "utf8",
  timeout: 7000,
  maxBuffer: 16 * 1024 * 1024,
});
if (fresh.error) throw fresh.error;
assert.equal(fresh.status, 0, fresh.stderr || `Observer exited ${fresh.signal}`);
/** @type {unknown} */
const runtime = JSON.parse(fresh.stdout);

const { IsInterfaceProxy } = loadDms("@antelopejs/interface-core");
const declaration = loadDms("@antelopejs/interface-dms/page");
const implementation = loadDms("./dist/implementations/dms/page.js");

/**
 * @param {unknown} handler
 * @returns {asserts handler is Function}
 */
function assertFunction(handler) {
  assert.equal(typeof handler, "function");
}

/**
 * @param {unknown} handler
 */
function describe(handler) {
  assertFunction(handler);
  return {
    name: handler.name,
    length: handler.length,
    async: handler.constructor.name === "AsyncFunction",
  };
}

/**
 * @param {unknown} value
 * @returns {value is { register: unknown, unregister: unknown }}
 */
function hasRegistration(value) {
  return value instanceof Object && "register" in value && "unregister" in value;
}

/**
 * @param {Record<string, unknown>} declared
 * @param {Record<string, unknown>} implemented
 * @param {string} [prefix]
 * @returns {[string, ReturnType<typeof describe>][]}
 */
function implementedProxies(declared, implemented, prefix = "page") {
  return Object.entries(declared)
    .sort(([a], [b]) => a.localeCompare(b))
    .flatMap(([key, value]) => {
      const path = `${prefix}.${key}`;
      const proxy =
        typeof value === "function" && "proxy" in value ? value.proxy : value;
      if (IsInterfaceProxy(proxy, "async")) {
        return [[path, describe(implemented[key])]];
      }
      if (IsInterfaceProxy(proxy, "registering")) {
        const handlers = implemented[key];
        assert.ok(hasRegistration(handlers), `${path} must implement register and unregister`);
        return [
          [`${path}.register`, describe(handlers.register)],
          [`${path}.unregister`, describe(handlers.unregister)],
        ];
      }
      if (value && typeof value === "object" && !IsInterfaceProxy(value)) {
        return implementedProxies(value, implemented[key] ?? {}, path);
      }
      return [];
    });
}

const controller = Object.fromEntries(
  Object.getOwnPropertyNames(implementation.DMSController.prototype)
    .filter((key) => key !== "constructor")
    .sort()
    .map((key) => [key, describe(implementation.DMSController.prototype[key])]),
);
const exportedFunctions = Object.fromEntries(
  Object.entries(implementation)
    .filter(([, value]) => typeof value === "function")
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => [key, describe(value)]),
);

const { compileRowRule } = loadDms("./dist/implementations/dms-base/footer-summary.js");
/** @type {string[]} */
const evaluationOrder = [];
const result = compileRowRule(
  {
    field: "amount",
    get equals() {
      evaluationOrder.push("operand");
      return 41;
    },
  },
  (field) => {
    evaluationOrder.push(`read:${field}`);
    return {
      get eq() {
        evaluationOrder.push("method");
        return (value) => value === 41;
      },
    };
  },
);
assert.equal(result, true);
assert.deepEqual(evaluationOrder, ["read:amount", "operand", "method"]);

async function uploadEvaluationOrder() {
  const fs = require("node:fs");
  const { Readable } = require("node:stream");
  const storage = loadDms("@antelopejs/interface-file-storage");
  const { uploadExportToStorage } = loadDms("./dist/utils/export-jobs.js");
  const original = {
    stat: fs.promises.stat,
    unlink: fs.promises.unlink,
    createReadStream: fs.createReadStream,
    toWeb: Object.getOwnPropertyDescriptor(Readable, "toWeb"),
    createUploadUrl: storage.CreateUploadUrl,
    fetch: globalThis.fetch,
  };
  /** @type {string[]} */
  const trace = [];
  let uploadUrl = "https://old.example";
  try {
    fs.promises.stat = async () => ({ size: 1 });
    fs.promises.unlink = async () => undefined;
    fs.createReadStream = () => ({});
    Readable.toWeb = () => {
      trace.push("toWeb");
      return "body";
    };
    storage.CreateUploadUrl = async () => ({
      get uploadUrl() {
        trace.push("url");
        return uploadUrl;
      },
      get headers() {
        trace.push("headers");
        uploadUrl = "https://new.example";
        return {};
      },
      resourceKey: "resource",
    });
    globalThis.fetch = async (/** @type {string} */ url) => {
      trace.push(`fetch ${url}`);
      return { ok: true };
    };
    assert.equal(
      await uploadExportToStorage(
        "scratch",
        "tenant",
        "export",
        "csv",
        "text/csv",
      ),
      "resource",
    );
    assert.deepEqual(trace, [
      "url",
      "headers",
      "toWeb",
      "fetch https://old.example",
    ]);
    return trace;
  } finally {
    fs.promises.stat = original.stat;
    fs.promises.unlink = original.unlink;
    fs.createReadStream = original.createReadStream;
    assert.ok(original.toWeb, "Readable.toWeb is an own property");
    Object.defineProperty(Readable, "toWeb", original.toWeb);
    storage.CreateUploadUrl = original.createUploadUrl;
    globalThis.fetch = original.fetch;
  }
}

uploadEvaluationOrder()
  .then((uploadOrder) => {
    process.stdout.write(
      JSON.stringify({
        proxies: Object.fromEntries(
          implementedProxies(declaration, implementation),
        ),
        controller,
        exports: exportedFunctions,
        evaluationOrder,
        result,
        uploadOrder,
        runtime,
        registries: observeBootedRegistries(),
      }) + "\n",
    );
  })
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });

function observeBootedRegistries() {
  const name = `backend-runtime-${process.pid}`;
  const directory = nodePath.join(root, "packages/dms/dist/test", name);
  const marker = "BACKEND_RUNTIME_REGISTRIES=";
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(nodePath.join(directory, "probe.test.js"), `
const assert = require("node:assert/strict");
describe("booted backend registry observations", function () {
  it("preserves public registry order", async function () {
    const html = require("@antelopejs/interface-dms/html-render");
    const pages = require("@antelopejs/interface-dms/page");
    const permissions = require("@antelopejs/interface-dms/permissions");
    const hooks = require("@antelopejs/interface-dms/hooks");
    const blocks = require("@antelopejs/interface-dms/base/block-registry");
    const sources = require("@antelopejs/interface-dms/base/data-sources");
    const templates = Object.keys(await html.GetAllHtmlTemplates());
    assert.ok(templates.length > 0, "No booted HTML templates observed");
    const treeKeys = (tree) => Object.entries(tree).map(([key, node]) =>
      [key, node.data?.id ?? null, treeKeys(node.children)]);
    const observations = {
      templates,
      pages: await pages.GetRegisteredPageIds(),
      permissions: treeKeys(await permissions.GetPermissions()),
      hooks: Object.fromEntries(Object.values(hooks.Hook).map((name) =>
        [name, hooks.GetRegisteredHooks(name).map((entry) =>
          ({ moduleId: entry.moduleId ?? null, handler: entry.handler.name }))])),
      blocks: blocks.ListBlockTypes().map((entry) => entry.type),
      dataSources: sources.ListDataSources().map((entry) => entry.id),
    };
    console.log(${JSON.stringify(marker)} + JSON.stringify(observations));
  });
});
`);
    const boot = spawnSync(process.execPath, ["-e", `
const { createRequire } = require("node:module");
const { dirname, join, resolve } = require("node:path");
const { realpathSync } = require("node:fs");
const moduleRoot = process.argv[1];
const load = createRequire(join(moduleRoot, "package.json"));
const core = dirname(load.resolve("@antelopejs/core/package.json"));
const test = load(join(core, "dist/core/test/test-module.js"));
const { NodeFileSystem } = load(join(core, "dist/core/filesystem.js"));
const { mergeDeep } = load(join(core, "dist/utils/object.js"));
const { internal } = load("@antelopejs/interface-core/internal");
async function boot() {
  const fs = new NodeFileSystem();
  const loaded = await test.loadTestConfig(moduleRoot, fs);
  if (!loaded) throw new Error("Missing backend test configuration");
  loaded.config.cacheFolder = resolve(
    dirname(realpathSync(join(moduleRoot, "node_modules"))),
    loaded.config.cacheFolder,
  );
  let manager;
  try {
    const overrides = await loaded.test.setup?.();
    const config = overrides ? mergeDeep(loaded.config, overrides) : loaded.config;
    manager = await test.setupTestEnvironment(moduleRoot, config, fs);
    return await test.executeTests(moduleRoot, loaded.test, manager, fs, [process.argv[2]]);
  } finally {
    try {
      if (manager) await manager.destroyAll();
    } finally {
      internal.testStubMode = false;
      if (manager) manager.resolver.stubModulePath = undefined;
      await loaded.test.cleanup?.();
    }
  }
}
boot().then((failures) => { process.exitCode = failures > 0 ? 1 : 0; })
  .catch((error) => { console.error(error); process.exitCode = 1; });
`, nodePath.join(root, "packages/dms"), nodePath.join(directory, "probe.test.js")], {
      cwd: nodePath.join(root, "packages/dms"),
      env: { ...process.env, DMS_PREBUILT: "1", DMS_TEST_DIR: `dist/test/${name}` },
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (boot.error) throw boot.error;
    assert.equal(boot.status, 0, boot.stdout + boot.stderr);
    const lines = boot.stdout.split("\n").filter((line) => line.includes(marker));
    assert.equal(lines.length, 1, boot.stdout + boot.stderr);
    /** @type {unknown} */
    const observed = JSON.parse(lines[0].slice(lines[0].indexOf(marker) + marker.length));
    return observed;
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

/**
 * @param {string | symbol} key
 */
function keyInfo(key) {
  return typeof key === "symbol" ? { symbol: String(key), global: Symbol.keyFor(key) ?? null } : key;
}

/**
 * @param {unknown} fn
 */
function functionInfo(fn) {
  let constructible = true;
  try {
    Reflect.construct(Object, [], fn);
  } catch {
    constructible = false;
  }
  return { ...describe(fn), constructible };
}

/**
 * @param {unknown} value
 * @returns {Record<string, unknown>}
 */
function typeInfo(value) {
  if (value === undefined) return { kind: "undefined" };
  if (value === null) return { kind: "null" };
  if (Array.isArray(value)) return { kind: "array", values: value.map(typeInfo) };
  if (typeof value === "function") return { kind: "function", ...functionInfo(value) };
  return { kind: typeof value, value: String(value) };
}

/**
 * @param {unknown} object
 */
function propertyInfo(object) {
  if (object === null || !["object", "function"].includes(typeof object)) return [];
  return Reflect.ownKeys(object).map((key) => {
    const descriptor = Object.getOwnPropertyDescriptor(object, key);
    const common = {
      key: keyInfo(key),
      enumerable: descriptor.enumerable,
      configurable: descriptor.configurable,
    };
    return "value" in descriptor
      ? { ...common, kind: "data", writable: descriptor.writable,
          value: typeof descriptor.value === "function"
            ? { kind: "function", ...functionInfo(descriptor.value) }
            : { kind: descriptor.value === null ? "null" : typeof descriptor.value } }
      : { ...common, kind: "accessor",
          get: descriptor.get ? functionInfo(descriptor.get) : null,
          set: descriptor.set ? functionInfo(descriptor.set) : null };
  });
}

/**
 * @param {Function | { constructor?: Function }} target
 * @param {string | symbol | undefined} key
 */
function targetInfo(target, key) {
  return {
    class: typeof target === "function" ? target.name : target.constructor?.name,
    placement: typeof target === "function" ? "static" : "prototype",
    member: key === undefined ? null : keyInfo(key),
  };
}

function observeRuntime() {
  const Module = require("node:module");
  const contract = baselineContract();
  const dist = nodePath.join(root, "packages/dms/dist");
  const inside = (/** @type {string} */ file) => file.startsWith(dist + sep);
  const moduleName = (/** @type {string} */ file) => nodePath.relative(dist, file).split(sep).join("/");
  createRequire(load.resolve("@antelopejs/interface-core"))("reflect-metadata");
  assert.equal(typeof Reflect.decorate, "function");
  assert.equal(typeof Reflect.getOwnMetadata, "function");
  const originalCompile = Module.prototype._compile;
  const originalDecorate = Reflect.decorate;
  const originalMetadata = Reflect.metadata;
  /** @type {Set<string>} */
  const reached = new Set();
  /** @type {{ site: ReturnType<typeof targetInfo>, target: Function | { constructor?: Function }, key: string | symbol | undefined, result: Function | PropertyDescriptor | undefined }[]} */
  const decorated = [];
  /** @type {unknown[]} */
  const applications = [];
  /** @type {WeakMap<Function, { key: unknown, value: unknown }>} */
  const metadataDecorators = new WeakMap();

  Module.prototype._compile = function (/** @type {string} */ source, /** @type {string} */ filename, /** @type {unknown[]} */ ...rest) {
    if (inside(filename)) reached.add(filename);
    return originalCompile.call(this, source, filename, ...rest);
  };
  Reflect.metadata = function (/** @type {unknown} */ key, /** @type {unknown} */ value) {
    const decorator = originalMetadata.call(this, key, value);
    metadataDecorators.set(decorator, { key: typeInfo(key), value: typeInfo(value) });
    return decorator;
  };
  Reflect.decorate = function (decorators, target, key, _descriptor) {
    const site = targetInfo(target, key);
    const call = decorated.length;
    const record = { site, target, key, result: undefined };
    decorated.push(record);
    const wrapped = decorators.map((decorator, index) => function (...args) {
      applications.push({
        call,
        ...site,
        index,
        decorator: metadataDecorators.get(decorator) ?? functionInfo(decorator),
      });
      return Reflect.apply(decorator, this, args);
    });
    const args = Array.from(arguments);
    args[0] = wrapped;
    record.result = originalDecorate.apply(this, args);
    return record.result;
  };

  try {
    load(nodePath.join(dist, "index.js"));
    const implementationEntries = contract.implementationEntries.map((name) => {
      const file = nodePath.join(dist, name);
      const exports = loadExports(file);
      return {
        module: name,
        ownKeys: Reflect.ownKeys(exports).map(keyInfo),
        exportKeySet: Object.keys(exports).sort(),
      };
    });

    const designKeys = ["design:type", "design:paramtypes", "design:returntype"];
    const metadata = decorated.map(({ site, target, key, result }) => ({
      ...site,
      metadata: designKeys.map((name) => ({
        key: name,
        present: Reflect.hasOwnMetadata(name, target, key),
        value: typeInfo(Reflect.getOwnMetadata(name, target, key)),
      })),
      replacementMetadata: key === undefined && typeof result === "function"
        ? designKeys.map((name) => ({
            key: name,
            present: Reflect.hasOwnMetadata(name, result),
            value: typeInfo(Reflect.getOwnMetadata(name, result)),
          }))
        : null,
    }));
    assert.ok(metadata.length > 0, "No backend decorators observed");
    assert.ok(metadata.some((item) => item.class === "RegionSettingsController"
      && item.member === "getPreferences"), "Region preferences metadata not reached");
    const modules = contract.modules.map((name) => {
      const originalFile = nodePath.join(dist, name);
      const file = reached.has(originalFile) ? originalFile
        : nodePath.join(dist, contract.moves.get(name) ?? name);
      assert.ok(reached.has(file), `Baseline module not reached ${name}`);
      const cached = require.cache[file];
      assert.ok(cached, `Missing loaded module ${moduleName(file)}`);
      const originalKeys = contract.privateBarrels[name];
      const keep = originalKeys
        ? (/** @type {string | symbol} */ key) => originalKeys.includes(String(key))
        : () => true;
      const cachedExports = loadExports(file);
      if (originalKeys) {
        for (const key of originalKeys) {
          assert.ok(Object.hasOwn(cachedExports, key), `Missing baseline export ${name}.${key}`);
        }
      }
      return {
        module: name,
        ownKeys: Reflect.ownKeys(cachedExports).filter(keep).map(keyInfo),
        properties: propertyInfo(cachedExports).filter((item) => keep(item.key)),
      };
    });
    for (const name of ["utils/index.js", "implementations/dms/page.js",
      "implementations/dms-base/table-view.js"]) {
      assert.ok(modules.some((item) => item.module === name), `Loader did not reach ${name}`);
    }
    return { modules, implementationEntries, metadata, applications };
  } finally {
    Module.prototype._compile = originalCompile;
    Reflect.decorate = originalDecorate;
    Reflect.metadata = originalMetadata;
  }
}
