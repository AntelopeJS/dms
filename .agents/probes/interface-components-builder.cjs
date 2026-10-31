const path = require("node:path");

const { createRequire } = require("node:module");

const {
  execFileSync,
} = require("node:child_process");

const root = process.argv[2];

const requireInterface = createRequire(
  path.join(root, "packages/interface-dms/package.json"),
);

const assert = require("node:assert/strict");

/**
 * @typedef {{
 *   "./dist/component.js": typeof import("../../packages/interface-dms/dist/component.js");
 *   "./dist/base/data-types/index.js": typeof import("../../packages/interface-dms/dist/base/data-types/index.js");
 *   "./dist/page/metadata.js": typeof import("../../packages/interface-dms/dist/page/metadata.js");
 *   "./dist/uploads.js": typeof import("../../packages/interface-dms/dist/uploads.js");
 *   "./dist/base/display.js": typeof import("../../packages/interface-dms/dist/base/display.js");
 *   "./dist/base/block-registry/internal/ui.js": typeof import("../../packages/interface-dms/dist/base/block-registry/internal/ui.js");
 * }} InterfaceModules
 */

/**
 * The one place this probe reads built interface-dms output: each entry is typed by the declaration the build emits next to it.
 * @template {keyof InterfaceModules} Entry
 * @param {Entry} entry
 * @returns {InterfaceModules[Entry]}
 */
function loadInterface(entry) {
  return requireInterface(entry);
}

/** @typedef {InstanceType<InterfaceModules["./dist/page/metadata.js"]["PageMetadata"]>} Page */

/**
 * @param {string} text
 * @returns {unknown}
 */
function parseJson(text) {
  return JSON.parse(text);
}

const {
  Action,
  Component,
  ComponentBuilder,
  ComponentTarget,
  getPermissionIdRef,
} = loadInterface("./dist/component.js");

async function observeUploadConstraintReads() {
  const { PageMetadata } = loadInterface("./dist/page/metadata.js");
  const uploads = loadInterface("./dist/uploads.js");
  const priorSigner = uploads.SignUploadToken;
  const observed = [];
  try {
    for (const mode of ["undefined", "null", "false", "number", "string", "array", "proxy"]) {
      const page = new PageMetadata(class ConstraintReadProbe {});
      page.skipComponentPermissions = true;
      page.componentMap.set("constraint.component", { access: "own" });
      /** @type {unknown[]} */
      const trace = [];
      let maxReads = 0;
      let mimeReads = 0;
      const proxy = new Proxy({}, {
        get(_target, key, receiver) {
          trace.push([key, receiver === proxy]);
          if (key === "maxSize") return ++maxReads === 1 ? 17 : 29;
          if (key === "allowedMimetypes") return ++mimeReads === 1 ? [17] : [false, "image/png", 31];
        },
      });
      /** @type {Record<string, unknown>} */
      const values = { undefined, null: null, false: false, number: 17, string: "plain", array: [], proxy };
      const options = {
        get constraints() { trace.push(["constraints", this === options]); return values[mode]; },
      };
      /** @type {unknown} */
      let constraints;
      uploads.SignUploadToken = async (/** @type {{ constraints?: unknown }} */ registration) => {
        constraints = registration.constraints;
        page.detached = true;
        return "constraint-probe-token";
      };
      await page.registerNativeUploadField({ disabled: true, component: { options } }, "probe", "constraint.component", []);
      observed.push({ mode, trace, constraints: constraints ?? null });
    }
  } finally {
    uploads.SignUploadToken = priorSigner;
  }
  assert.deepEqual(observed, [
    ...["undefined", "null", "false", "number", "string"].map((mode) => ({ mode, trace: [["constraints", true]], constraints: null })),
    { mode: "array", trace: [["constraints", true]], constraints: {} },
    { mode: "proxy", trace: [["constraints", true], ["maxSize", true], ["maxSize", true], ["allowedMimetypes", true], ["allowedMimetypes", true]], constraints: { maxSize: 29, allowedMimetypes: ["image/png"] } },
  ]);
  return observed;
}

function observeDefaultTypesFresh() {
  const script = `
    const { createRequire } = require("node:module");
    const { join } = require("node:path");
    const load = createRequire(join(process.argv[1], "packages/interface-dms/package.json"));
    const core = load("./dist/base/data-types/core.js");
    const registrations = [];
    const register = core.RegisterDataType;
    core.RegisterDataType = (id) => {
      registrations.push(id);
      return register(id);
    };
    load(process.argv[2]);
    const defaults = load("./dist/base/data-types/default-types.js");
    const descriptors = (value) => Reflect.ownKeys(value).map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return [String(key), descriptor.enumerable, descriptor.configurable,
        descriptor.writable, Boolean(descriptor.get), Boolean(descriptor.set)];
    });
    const observations = Object.entries(defaults.DefaultDataTypes).map(([name, Type]) => {
      if (typeof Type !== "function") return [name, "not a constructor"];
      const options = { marker: 73, min: 2, max: 11, minLength: 2, maxLength: 7,
        items: [{ label: "First", value: "first" }, { label: "Other", value: "other" }],
        dataApiController: class Related {}, keyMapping: { label: "title", value: "_id", parent: "parent" } };
      try {
        const instance = new Type(options);
        let validation;
        try {
          const schema = instance.getValidation();
          validation = [undefined, null, "x", "first", 1, 5, true, [], {}].map((value) => schema.safeParse(value).success);
        } catch (error) { validation = { error: error.message }; }
        const registered = core.getDataTypeId(instance);
        return [name, Type.name, registered, Object.keys(instance),
          instance.options === options, Object.getPrototypeOf(instance).constructor === Type,
          registered ? core.CreateDataType(registered, options) instanceof Type : false, validation];
      } catch (error) { return [name, { error: error.message }]; }
    });
    process.stdout.write(JSON.stringify({ registrations, observations,
      exports: descriptors(defaults), namespace: descriptors(defaults.DefaultDataTypes),
      select: defaults.SELECT_DISPLAYS, boolean: defaults.BOOLEAN_DISPLAYS }));
  `;
  return [
    "./dist/base/data-types/default-types.js",
    "./dist/base/data-types/index.js",
    "./dist/base/table-view.js",
  ].map((entry) => parseJson(execFileSync(process.execPath, ["-e", script, root, entry], { encoding: "utf8" })));
}

function observeDataTypesAndHints() {
  const { blockFetchUrlOption } = loadInterface("./dist/base/display.js");
  const { getUiHints } = loadInterface(
    "./dist/base/block-registry/internal/ui.js",
  );
  const { DataType, RegisterDataType, RegisterDataCompareMode, serializeType } =
    loadInterface("./dist/base/data-types/index.js");
  /** @type {unknown[]} */
  const registrations = [];
  class EmptyMode {
    constructor() {
      registrations.push("empty");
    }
  }
  class KeptMode {
    constructor() {
      registrations.push("kept");
    }
  }
  RegisterDataCompareMode("")(EmptyMode);
  RegisterDataCompareMode("probe-kept")(KeptMode);
  class ProbeType extends DataType {
    constructor() {
      super([EmptyMode, KeptMode], KeptMode, { marker: 61 });
    }
    defaultInputComponent() {
      return { componentName: "probe", options: {} };
    }
  }
  RegisterDataType("probe-type")(ProbeType);
  const hints = [
    [undefined, undefined],
    ["period", undefined],
    ["period", "series"],
    ["", "series"],
  ].map(([period, response]) => {
    const value = getUiHints(
      blockFetchUrlOption("probe source", period, response),
    );
    return { value, keys: Object.keys(value) };
  });
  return { hints, registrations, type: serializeType(new ProbeType()) };
}

async function observe() {
  const child = new ComponentBuilder("child").options({ label: "nested" });
  const builder = new ComponentBuilder("parent")
    .options({ label: "original", watchActions: [{ forged: true }] })
    .mergeOptions({ label: "merged", marker: 17 })
    .child("nested", child, { slot: "aside", weight: 3 })
    .watch("load", "refresh", { params: { nonce: 7 } })
    .watch("change", "refresh", { params: { nonce: 19 } })
    .watchOn("nested", "load", "refresh", { params: { nonce: 23 } })
    .watchFilter(async (_permissions, watches) => watches.slice(1))
    .onFilter(async (_permissions, options) => ({ ...options, marker: 29 }));
  const view = new Proxy(builder, {});
  const sync = view.serializeSync();
  const serialized = await view.serialize();
  /** @type {unknown} */
  const filtered = await view.onFilterCallback(
    new Set(["page.component.refresh"]),
    serialized.options,
    "page.component",
    { tenantId: "tenant", user: undefined },
  );
  const shadowedCallFilter = Object.assign(
    /** @this {{ metadata: { name: string } }} @param {unknown} _permissions @param {Record<string, unknown>} options */
    function (_permissions, options) {
      return { ...options, receiver: this.metadata.name };
    },
    { call: undefined },
  );
  const shadowedCallBuilder = new ComponentBuilder("probe")
    .options({ x: 17 })
    .onFilter(shadowedCallFilter);
  /** @type {unknown} */
  const shadowedCall = await shadowedCallBuilder.onFilterCallback(
    new Set(),
    { x: 17 },
    "page.probe",
    {},
  );
  const plain = new Component(
    { componentName: "positional", options: { x: 31 } },
    { name: "positional metadata" },
    () => undefined,
  );
  const target = new ComponentTarget(plain, ["left", "right"]);
  const priorGet = Object.getOwnPropertyDescriptor(getPermissionIdRef, "get");
  assert.ok(priorGet, "getPermissionIdRef.get is an own property");
  getPermissionIdRef.get = (component) =>
    component === plain ? "page.plain" : undefined;
  const action = new Action(
    "edit",
    { title: "Edit", dependencies: ["view"] },
    plain,
  );
  const permission = action.toPermission();
  Object.defineProperty(getPermissionIdRef, "get", priorGet);
  return {
    sync,
    serialized,
    filtered,
    shadowedCall,
    ownKeys: Object.keys(builder),
    positional: {
      metadata: plain.metadata,
      info: plain.serializeSync(),
      created: plain.onPageCreated !== undefined,
      targetRoot: target.root === plain,
      path: target.path,
    },
    permission,
    uploadConstraintReads: await observeUploadConstraintReads(),
    defaultTypesFresh: observeDefaultTypesFresh(),
    dataTypesAndHints: observeDataTypesAndHints(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  });
