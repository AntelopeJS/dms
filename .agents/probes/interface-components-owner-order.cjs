const path = require("node:path");

const root = process.argv[2];

/** api-diff runs a scratch copy of this file, so relative requires must start from the tree under test. */
module.filename = path.join(root, ".agents/probes/interface-components-owner-order.cjs");

const assert = require("node:assert/strict");

/** @typedef {InstanceType<typeof import("../../packages/interface-dms/dist/component.js")["ComponentBuilder"]>} ComponentBuilderInstance */

/**
 * @param {unknown} value
 * @returns {number}
 */
function watchCount(value) {
  assert.ok(value instanceof Object && "watchActions" in value && Array.isArray(value.watchActions), "Expected watch actions");
  return value.watchActions.length;
}

/**
 * @param {unknown} value
 * @returns {Function}
 */
function ownMethod(value) {
  assert.ok(value instanceof Function, "Expected a function");
  return value;
}

const {
  ComponentBuilder,
} = require("../../packages/interface-dms/dist/component.js");

/**
 * @param {typeof import("../../packages/interface-dms/dist/page/metadata.js")["PageMetadata"]} PageMetadata
 * @param {typeof import("../../packages/interface-dms/dist/page/internal/registry.js")["pageExtensions"]} pageExtensions
 * @param {boolean} throws
 */
async function ownerExtensionComponent(PageMetadata, pageExtensions, throws) {
  const page = new PageMetadata(class ExtensionOwnerAccessorProbe {});
  const before = new ComponentBuilder("before").options({ marker: "before" });
  const after = new ComponentBuilder("after").options({ marker: "after" });
  const contribution = { key: "child", component: before };
  const info = {
    extensionName: "owner-accessor-probe",
    targetFullId: `owner-accessor-probe-${throws}`,
    components: [contribution],
  };
  /** @type {unknown[]} */
  const trace = [];
  page.prepareComponent = /** @this {Page} @param {[ComponentBuilderInstance, string]} args */ function (...args) {
    trace.push(["prepare", this === page, args.length, args[0].serializeSync().options.marker, args[1]]);
    throw new Error("owner-accessor-prepare-stop");
  };
  Object.defineProperty(page, throws ? "unregisterComponent" : "prepareComponent", {
    get() {
      trace.push(["get", this === page]);
      contribution.component = after;
      return /** @this {Page} @param {[ComponentBuilderInstance, string]} args */ function (...args) {
        trace.push(["call", this === page, args.length, args[0].serializeSync().options.marker, args[1]]);
        return async () => ({ key: args[1], serialized: args[0].serializeSync() });
      };
    },
  });
  const prior = pageExtensions.get(info.targetFullId);
  pageExtensions.set(info.targetFullId, [info]);
  try {
    await page.addExtension(info);
    return trace;
  } finally {
    if (prior === undefined) pageExtensions.delete(info.targetFullId);
    else pageExtensions.set(info.targetFullId, prior);
  }
}

/**
 * @param {typeof import("../../packages/interface-dms/dist/page/metadata.js")["PageMetadata"]} PageMetadata
 * @param {typeof import("../../packages/interface-dms/dist/page/internal/registry.js")["pageExtensions"]} pageExtensions
 */
function ownerAccessorCases(PageMetadata, pageExtensions) {
  return {
    async preparePermissionId() {
      const page = new PageMetadata(class PrepareOwnerAccessorProbe {});
      page.skipComponentPermissions = true;
      page.pagePermissionId = "before";
      const component = new ComponentBuilder("child").options({ marker: 17 });
      /** @type {unknown[]} */
      const trace = [];
      Object.defineProperty(page, "bindNativeUploadFields", {
        get() {
          trace.push(["get", this === page]);
          page.pagePermissionId = "after";
          return async function (...args) {
            trace.push(["call", this === page, args.length, args[0].componentName, args[1]]);
          };
        },
      });
      try {
        await page.prepareComponent(component, "child")();
        return trace;
      } finally {
        page.Dispose();
      }
    },
    async uploadComponentName() {
      const page = new PageMetadata(class UploadNameOwnerAccessorProbe {});
      page.componentMap.set("page.child", { access: "own" });
      const serialized = { componentName: "before", options: { marker: 17 } };
      /** @type {unknown[]} */
      const trace = [];
      Object.defineProperty(page, "bindUploadOptions", {
        get() {
          trace.push(["get", this === page]);
          serialized.componentName = "after";
          return async function (...args) {
            trace.push(["call", this === page, args.length, args[0] === serialized.options, args[1], args[2], args[3]]);
          };
        },
      });
      await page.bindNativeUploadFields(serialized, "page.child");
      return trace;
    },
    async uploadChildId() {
      const page = new PageMetadata(class UploadChildOwnerAccessorProbe {});
      page.componentMap.set("page.child", { access: "own" });
      const component = new ComponentBuilder("child").options({ marker: 17 }).serializeSync();
      const child = { id: "before", component };
      const serialized = { componentName: "parent", children: [child] };
      /** @type {unknown[]} */
      const trace = [];
      const bind = ownMethod(page.bindNativeUploadFields);
      Object.defineProperty(page, "bindNativeUploadFields", {
        get() {
          trace.push(["get", this === page]);
          child.id = "after";
          return async function (/** @type {unknown[]} */ ...args) {
            trace.push(["call", this === page, args.length, args[0] === component, args[1]]);
          };
        },
      });
      await bind.call(page, serialized, "page.child");
      return trace;
    },
    async extensionPrepareComponent() {
      return ownerExtensionComponent(PageMetadata, pageExtensions, false);
    },
    async extensionUnregisterComponent() {
      return ownerExtensionComponent(PageMetadata, pageExtensions, true);
    },
    async unregisterNodeComponent() {
      const page = new PageMetadata(class UnregisterNodeOwnerAccessorProbe {});
      page.registersComponentPermissions = () => true;
      /** @type {unknown[]} */
      const trace = [];
      let component = "before";
      const node = {
        access: "shared",
        get component() {
          trace.push(["component", this === node]);
          return component;
        },
      };
      Object.defineProperty(page, "actionPermissions", {
        get() {
          trace.push(["get", this === page]);
          component = "after";
          return function (...args) {
            trace.push(["call", this === page, args.length, args[0]]);
            return [];
          };
        },
      });
      page.unregisterComponentNode(node);
      return trace;
    },
    async uploadPathIterator() {
      const page = new PageMetadata(class UploadPathOwnerAccessorProbe {});
      const bind = ownMethod(page.bindUploadOptions);
      /** @type {unknown[]} */
      const trace = [];
      let segment = "before";
      const path = {
        *[Symbol.iterator]() {
          trace.push(["iterate", this === path]);
          yield segment;
        },
      };
      Object.defineProperty(page, "bindUploadOptions", {
        get() {
          trace.push(["get", this === page]);
          segment = "after";
          return async function (...args) {
            trace.push(["call", this === page, args.length, args[0], args[1], args[2], args[3]]);
          };
        },
      });
      await bind.call(page, { child: 17 }, "probe", "page.child", path);
      return trace;
    },
  };
}

async function observeOwnerAccessorOrder() {
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const { pageExtensions } = require("../../packages/interface-dms/dist/page/internal/registry.js");
  const results = {};
  const expected = {};
  const failures = [];
  const cases = ownerAccessorCases(PageMetadata, pageExtensions);
  expected.preparePermissionId = [["get", true], ["call", true, 2, "child", "after.child"]];
  expected.uploadComponentName = [["get", true], ["call", true, 4, true, "after", "page.child", []]];
  expected.uploadChildId = [["get", true], ["call", true, 2, true, "page.child.after"]];
  expected.extensionPrepareComponent = [["get", true], ["call", true, 2, "after", "child"]];
  expected.extensionUnregisterComponent = [["prepare", true, 2, "before", "child"], ["get", true], ["call", true, 2, "after", "child"]];
  expected.unregisterNodeComponent = [["get", true], ["component", true], ["call", true, 1, "after"]];
  expected.uploadPathIterator = [["get", true], ["iterate", true], ["call", true, 4, 17, "probe", "page.child", ["after", "child"]]];
  for (const [name, run] of Object.entries(cases)) {
    try {
      results[name] = await run();
      assert.deepEqual(results[name], expected[name], name);
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) {
    throw new AggregateError(failures, `Owner accessor order failed: ${JSON.stringify(results)}\n${failures.map((error) => (error instanceof Error ? error.stack : String(error))).join("\n")}`);
  }
  return results;
}

async function observePublicWatchFilterOrder() {
  const { GetMetadata } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
  const { DataAPIMeta } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-data-api/dist/metadata.js");
  const { TableView } = require("../../packages/interface-dms/dist/base/table-view/factory.js");
  const results = [];
  for (let trial = 0; trial < 3; trial++) {
    class Controller {}
    class Table {}
    Controller.location = "/probe";
    GetMetadata(Controller, DataAPIMeta).tableClass = Table;
    let expired = false;
    let reads = 0;
    /** @type {unknown[]} */
    const trace = [];
    const builder = TableView(Controller, {
      realtime: false,
      formContainer: { type: "drawer" },
    })
      .watch("load", "refresh")
      .watchFilter((_permissions, watches) => {
        trace.push("watchFilter");
        return expired ? [] : watches;
      });
    const options = builder.serializeSync().options;
    Object.defineProperty(options, "enableTableExport", {
      enumerable: true,
      get() {
        if (++reads === 2) {
          queueMicrotask(() => queueMicrotask(() => {
            expired = true;
            trace.push("expire");
          }));
        }
        return false;
      },
    });
    /** @type {unknown} */
    const result = await builder.onFilterCallback(new Set(["*"]), options, "page.table", {});
    results.push({ trace, watches: watchCount(result) });
  }
  assert.deepEqual(results, Array.from({ length: 3 }, () => ({
    trace: ["watchFilter", "expire"],
    watches: 1,
  })), "A forwarding async callback must not delay the public watchFilter");
  return results;
}

async function observePublicPageScheduling() {
  const { ImplementInterface } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
  const { PageMetadata, GetPageLayoutBySlug } = require("../../packages/interface-dms/dist/page.js");
  const { SignUploadToken } = require("../../packages/interface-dms/dist/uploads.js");
  ImplementInterface({ SignUploadToken }, { SignUploadToken: async () => "timing-token" });
  /** @type {unknown[]} */
  const trace = [];
  let ticks = 0;
  let active = true;
  const tick = () => {
    if (active) {
      ticks++;
      queueMicrotask(tick);
    }
  };
  class TimedComponent extends ComponentBuilder {
    serialize() {
      trace.push(["serialize", ticks]);
      return super.serialize();
    }
  }
  const page = new PageMetadata(class PublicSchedulingProbe {});
  page.SetInfo("public-scheduling-probe", "/public-scheduling-probe", {
    displayName: "Scheduling",
    publicAccess: true,
    noComponentPermissions: true,
  }, { componentName: "layout" });
  page.SetComponent("first", new TimedComponent("first").options({
    nested: { field: { type: "file", component: { options: {} } } },
  }));
  page.SetComponent("second", new TimedComponent("second").options({ marker: 17 }));
  queueMicrotask(tick);
  try {
    await page.Register();
    trace.push(["registered", ticks]);
    await page.SyncExtensions();
    trace.push(["synced", ticks]);
    const layout = GetPageLayoutBySlug("/public-scheduling-probe");
    const result = await layout({});
    trace.push(["layout", ticks]);
    assert.deepEqual(Object.keys(result.components), ["first", "second"]);
    active = false;
    const failure = new Error("request getter");
    /** @type {Promise<unknown> | undefined} */
    let rejected;
    assert.doesNotThrow(() => {
      rejected = layout({ get query() { throw failure; } });
    });
    await assert.rejects(rejected, (/** @type {unknown} */ error) => error === failure);
    return trace;
  } finally {
    active = false;
    page.Dispose();
  }
}

async function observe() {
  return {
    ownerAccessorOrder: await observeOwnerAccessorOrder(),
    publicWatchFilterOrder: await observePublicWatchFilterOrder(),
    publicPageScheduling: await observePublicPageScheduling(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  });
