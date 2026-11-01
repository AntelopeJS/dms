const path = require("node:path");

const root = process.argv[2];

/** api-diff runs a scratch copy of this file, so relative requires must start from the tree under test. */
module.filename = path.join(root, ".agents/probes/interface-components-read-order.cjs");

const assert = require("node:assert/strict");

/** @typedef {InstanceType<typeof import("../../packages/interface-dms/dist/page/metadata.js")["PageMetadata"]>} Page */

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : undefined;
}

/**
 * @param {unknown} value
 * @returns {Map<unknown, unknown>}
 */
function asMap(value) {
  assert.ok(value instanceof Map, "Expected a Map");
  return value;
}

/**
 * Reads through a proxy exactly as a proxy without a `get` trap would.
 * @param {object} target
 * @param {PropertyKey} key
 * @param {unknown} receiver
 * @returns {unknown}
 */
function forwardRead(target, key, receiver) {
  return Reflect.get(target, key, receiver);
}

/**
 * Builds an object that inherits from `prototype` and owns `own`, as `Object.create(prototype)` followed by `Object.assign` does.
 * @param {object} prototype
 * @param {Record<string, unknown>} own
 */
function inherit(prototype, own) {
  const created = {};
  Object.setPrototypeOf(created, prototype);
  return Object.assign(created, own);
}

async function observeTypeBoundaries() {
  const api = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  const { CreateJwtAuthDecorator } = require("../../packages/interface-dms/dist/auth/internal/jwt-auth-decorator.js");
  const { getAuthenticatedRequestTenantId } = require("../../packages/interface-dms/dist/auth/internal/request-authenticators.js");
  const { isPrimitive } = require("../../packages/interface-dms/dist/utils/internal/type-check.js");
  const { CreateDataType } = require("../../packages/interface-dms/dist/base/data-types/index.js");
  const { collectFileRefs, remapRecordFileKeys } = require("../../packages/interface-dms/dist/base/helpers/file-refs.js");
  const { RegistrationIdentity } = require("../../packages/interface-dms/dist/page/internal/registry.js");
  const priorProvider = api.SetParameterProvider;
  const authenticated = [];
  /** @type {unknown[]} */
  const reads = [];
  /** @type {Parameters<typeof api.SetParameterProvider>[3] | undefined} */
  let provider;
  api.SetParameterProvider = (_target, _key, _index, value) => { provider = value; };
  try {
    for (const value of [null, false, 17, "plain", {}, { _id: 23 }, inherit({
      get _id() { reads.push(this.marker === 31); return "user-31"; },
    }, { marker: 31 })]) {
      const decorate = CreateJwtAuthDecorator({
        authenticator: async () => ({ tenantId: "tenant-17" }),
        validator: async () => value,
      });
      decorate()({}, "user");
      const ctx = { rawRequest: { headers: { authorization: "Bearer token" } } };
      const result = await provider(ctx);
      authenticated.push({
        identity: result === value,
        tenant: getAuthenticatedRequestTenantId(ctx) ?? null,
      });
    }
  } finally {
    api.SetParameterProvider = priorProvider;
  }
  /** @type {unknown[]} */
  const keyReads = [];
  const node = inherit({
    get key() { keyReads.push(this === node); return "image-17"; },
  }, { extra: 31 });
  const columns = { image: { type: CreateDataType("image", { storage: "proof" }) } };
  const refs = collectFileRefs(columns, { image: node });
  const remapped = await remapRecordFileKeys(columns, { image: node }, async (key, storage) => `${storage}/${key}`);
  const identity = new RegistrationIdentity("typed-local-probe");
  const original = {};
  identity.remember(original);
  let tokenReads = 0;
  const view = new Proxy(original, {
    get(target, key, receiver) {
      if (key === Symbol.for("@antelopejs/interface-dms:pageRegistration")) tokenReads++;
      return forwardRead(target, key, receiver);
    },
  });
  return {
    authenticated,
    reads,
    primitives: [undefined, null, false, 0, "text", 17n, Symbol("x"), {}, [], () => 1].map(isPrimitive),
    refs,
    remapped,
    keyReads,
    resolved: identity.resolve(view) === original,
    tokenReads,
  };
}

function observePageInfoPrecedence() {
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const { GetMetadata } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
  const results = [];
  for (const mode of ["explicit", "menu", "ancestor", "default", "controller"]) {
    /** @type {unknown[]} */
    const trace = [];
    const explicit = { componentName: "explicit-layout" };
    const menuLayout = { componentName: "menu-layout" };
    const ancestorLayout = { componentName: "ancestor-layout" };
    const ancestor = { fullId: "root", fullSlug: "/root", layout: ancestorLayout };
    const category = new Proxy(
      {
        fullId: "root.category",
        fullSlug: "/category",
        category: ancestor,
        hidden: true,
        publicAccess: true,
        authOnly: true,
        memberAccess: mode === "menu" ? "self" : true,
        bypassTenantAccessGate: true,
      },
      {
        get(target, key, receiver) {
          trace.push(`category.${String(key)}`);
          return forwardRead(target, key, receiver);
        },
      },
    );
    class CategoryController {}
    GetMetadata(CategoryController, PageMetadata).pageInfo = category;
    const options = {
      displayName: "Asymmetric page",
      hidden: false,
      publicAccess: false,
      authOnly: false,
      memberAccess: mode === "explicit" ? "self" : false,
      bypassTenantAccessGate: false,
      parent: { fullId: "other", fullSlug: "/parent-only" },
    };
    if (mode !== "default") {
      options.category = mode === "controller" ? CategoryController : category;
    }
    if (mode === "explicit" || mode === "menu") options.layout = menuLayout;
    const menu = new Proxy(options, {
      get(target, key, receiver) {
        trace.push(`menu.${String(key)}`);
        return forwardRead(target, key, receiver);
      },
    });
    class Controller {}
    const page = new PageMetadata(Controller);
    const receiver = new Proxy(page, {
      set(target, key, value, owner) {
        trace.push(`write.${String(key)}`);
        return Reflect.set(target, key, value, owner);
      },
    });
    const returned = receiver.SetInfo(
      "leaf",
      "/root//asymmetric/",
      menu,
      mode === "explicit" ? explicit : undefined,
    );
    const info = page.pageInfo;
    const pageCategory = info?.category;
    const snapshot = {
      ...info,
      category: pageCategory && "fullId" in pageCategory ? pageCategory.fullId : undefined,
    };
    results.push({
      mode,
      info: snapshot,
      keys: Object.keys(info),
      layout: page.layout,
      identity: [
        page.layout === explicit,
        page.layout === menuLayout,
        page.layout === ancestorLayout,
        info.category === category,
      ],
      returnsUndefined: returned === undefined,
      trace,
    });
  }
  return results;
}

async function observeExtractedPageCalls() {
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const api = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  const permissions = require("../../packages/interface-dms/dist/permissions.js");
  const { pageLayoutHandlers } = require("../../packages/interface-dms/dist/page/internal/registry.js");
  const priorRegister = api.RegisterRoute;
  const priorUnregister = api.UnregisterRoute;
  const priorPermission = permissions.HasPermission;
  let route;
  /** @type {unknown[]} */
  const calls = [];
  const page = new PageMetadata(class ForwardingProbe {});
  api.RegisterRoute = (value) => {
    route = value;
    return "extraction-probe";
  };
  api.UnregisterRoute = () => {};
  try {
    page.resolvePageLayout = /** @this {Page} @param {unknown[]} args */ function (...args) {
      calls.push({
        receiver: this === page,
        argc: args.length,
        options: args[1] ?? null,
      });
      return Promise.resolve({ marker: 17 });
    };
    page.registerLayoutRoute({
      fullSlug: "/extraction-probe",
      layoutUrl: "/extraction-probe/layout",
    });
    await route.callback.call({
      pageQuery: { q: "17" },
      pageParams: { id: "31" },
    });
    await pageLayoutHandlers.get("/extraction-probe")({ tenantId: "tenant" });
    page.Dispose();
  } finally {
    api.RegisterRoute = priorRegister;
    api.UnregisterRoute = priorUnregister;
  }
  permissions.HasPermission = async () => false;
  let pageInfoReads = 0;
  /** @type {unknown} */
  let layout;
  try {
    const owner = new PageMetadata(class LazyReadProbe {});
    owner.layoutRef = {
      layout: { componentName: "probe" },
      components: { secret: { componentName: "secret", options: { marker: 31 } } },
    };
    owner.pagePermissionId = "page";
    const receiver = new Proxy(owner, {
      get(target, key, receiver) {
        if (key === "pageInfo") {
          pageInfoReads++;
          return { publicAccess: pageInfoReads > 1 };
        }
        return forwardRead(target, key, receiver);
      },
    });
    layout = await receiver.resolvePageLayout({ tenantId: "tenant" });
  } finally {
    permissions.HasPermission = priorPermission;
  }
  let recursiveMethodReads = 0;
  const receiver = new Proxy(new PageMetadata(class RecursionProbe {}), {
    get(target, key, owner) {
      if (key === "bindUploadOptions") recursiveMethodReads++;
      return forwardRead(target, key, owner);
    },
  });
  await receiver.bindUploadOptions({ a: { b: 17 } }, "probe", "page.probe", []);
  return { calls, pageInfoReads, layout, recursiveMethodReads };
}

/**
 * @param {() => Page} fresh
 */
function publishOrder(fresh) {
  return [false, true].map((readAuthOnly) => {
    const page = fresh();
    /** @type {unknown[]} */
    const trace = [];
    const info = {
      fullId: `order-publish-${readAuthOnly}`,
      isModuleRoot: true,
      get noComponentPermissions() {
        trace.push(["noComponentPermissions", page.moduleScoped, this === info]);
        if (!readAuthOnly) throw new Error("order-stop");
        return false;
      },
      get authOnly() {
        trace.push(["authOnly", page.moduleScoped, this === info]);
        throw new Error("order-stop");
      },
    };
    try {
      page.publish(info);
    } catch (error) {
      if (messageOf(error) !== "order-stop") throw error;
    }
    /** @type {unknown} */
    const moduleScoped = page.moduleScoped;
    const state = { trace, moduleScoped };
    page.Dispose();
    return state;
  });
}

/**
 * @param {() => Page} fresh
 */
function notifyOrder(fresh) {
  return ["absent", "replace", "distinct"].map((mode) => {
    const page = fresh();
    /** @type {unknown[]} */
    const trace = [];
    let calls = 0;
    let reads = 0;
    let live = new Set();
    const first = live;
    const second = new Set();
    Object.defineProperty(page, "notifiedComponents", {
      get() {
        trace.push(["notified", ++reads, this === page]);
        return mode === "distinct" && reads > 1 ? second : live;
      },
    });
    const component = {
      get onPageCreated() {
        trace.push(["hook", this === component]);
        if (mode === "absent") return undefined;
        if (mode === "replace") live = new Set([component]);
        return /** @this {object} @param {unknown} owner */ function (owner) {
          calls++;
          trace.push(["call", this === component, owner === page]);
        };
      },
    };
    page.notifyPageCreated({ component, depth: 0, permissionId: "order.component" });
    return { mode, trace, calls, firstContains: first.has(component), secondContains: second.has(component) };
  });
}

/**
 * @param {() => Page} fresh
 */
function takenKeysOrder(fresh) {
  return [false, true].map((throws) => {
    const page = fresh();
    /** @type {unknown[]} */
    const trace = [];
    let live = new Map();
    Object.defineProperty(page, "pageInfo", {
      get() { trace.push(["pageInfo", this === page]); return { fullId: "order-page" }; },
    });
    const own = new Proxy({ own: {} }, {
      ownKeys(target) {
        trace.push(["ownKeys"]);
        if (throws) throw new Error("order-stop");
        live = new Map([[{ extensionName: "replacement" }, [{ key: "injected" }]]]);
        return Reflect.ownKeys(target);
      },
    });
    Object.defineProperty(page, "ownComponents", {
      get() { trace.push(["own", this === page]); return own; },
    });
    Object.defineProperty(page, "extensionEntries", {
      get() { trace.push(["entries", this === page]); return live; },
    });
    /** @type {unknown[] | undefined} */
    let keys;
    try {
      keys = [...asMap(page.takenComponentKeys())];
    } catch (error) {
      if (!throws || messageOf(error) !== "order-stop") throw error;
    }
    return { throws, trace, keys: keys ?? null };
  });
}

async function observeEvaluationOrder() {
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const fresh = () => new PageMetadata(class EvaluationOrderProbe {});
  const results = {};
  results.publish = publishOrder(fresh);
  const api = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  const register = api.RegisterRoute;
  const unregister = api.UnregisterRoute;
  /** @type {Parameters<typeof api.RegisterRoute>[0] | undefined} */
  let route;
  api.RegisterRoute = (value) => { route = value; return "order-route"; };
  api.UnregisterRoute = () => {};
  try {
    class First {}
    class Second {}
    /** @type {unknown[]} */
    const trace = [];
    let reads = 0;
    const receiver = new Proxy(fresh(), {
      get(target, key, owner) {
        if (key === "target") {
          trace.push(["target", ++reads, owner === receiver]);
          return reads === 1 ? First : Second;
        }
        return forwardRead(target, key, owner);
      },
    });
    receiver.registerLayoutRoute({
      fullSlug: "/order-route",
      get layoutUrl() { trace.push(["layoutUrl"]); return "/order-route/layout"; },
    });
    results.layoutRoute = { trace: [...trace], secondController: route.controller === Second };
    receiver.Dispose();
  } finally {
    api.RegisterRoute = register;
    api.UnregisterRoute = unregister;
  }
  results.notify = notifyOrder(fresh);
  results.addExtension = [];
  for (const throws of [false, true]) {
    const page = fresh();
    page.takenComponentKeys = () => new Map();
    const stale = asMap(page.extensionEntries);
    const replacement = new Map();
    /** @type {unknown[]} */
    const trace = [];
    let live = stale;
    Object.defineProperty(page, "extensionEntries", {
      get() { trace.push(["entries", this === page]); return live; },
    });
    const info = {
      extensionName: "order-extension",
      targetFullId: "order-page",
      get components() {
        trace.push(["components", this === info]);
        if (throws) throw new Error("order-stop");
        live = replacement;
        return [];
      },
    };
    try {
      await page.addExtension(info);
    } catch (error) {
      if (!throws || messageOf(error) !== "order-stop") throw error;
    }
    results.addExtension.push({ throws, trace, liveContains: replacement.has(info), staleContains: stale.has(info) });
  }
  results.takenKeys = takenKeysOrder(fresh);
  assert.deepEqual(results, {
    publish: [
      { trace: [["noComponentPermissions", true, true]], moduleScoped: true },
      { trace: [["noComponentPermissions", true, true], ["authOnly", true, true]], moduleScoped: true },
    ],
    layoutRoute: {
      trace: [["target", 1, true], ["layoutUrl"], ["target", 2, true]],
      secondController: true,
    },
    notify: [
      { mode: "absent", trace: [["hook", true]], calls: 0, firstContains: false, secondContains: false },
      { mode: "replace", trace: [["hook", true], ["notified", 1, true]], calls: 0, firstContains: false, secondContains: false },
      { mode: "distinct", trace: [["hook", true], ["notified", 1, true], ["notified", 2, true], ["hook", true], ["call", true, true]], calls: 1, firstContains: false, secondContains: true },
    ],
    addExtension: [
      { throws: false, trace: [["components", true], ["entries", true], ["components", true]], liveContains: true, staleContains: false },
      { throws: true, trace: [["components", true]], liveContains: false, staleContains: false },
    ],
    takenKeys: [
      { throws: false, trace: [["pageInfo", true], ["own", true], ["ownKeys"], ["entries", true]], keys: [["own", "order-page"], ["injected", "replacement"]] },
      { throws: true, trace: [["pageInfo", true], ["own", true], ["ownKeys"]], keys: null },
    ],
  });
  return results;
}

async function observe() {
  return {
    typeBoundaries: await observeTypeBoundaries(),
    pageInfoPrecedence: observePageInfoPrecedence(),
    extractedPageCalls: await observeExtractedPageCalls(),
    evaluationOrder: await observeEvaluationOrder(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  });
