const { join } = require("node:path");
const { createRequire } = require("node:module");
const { execFileSync } = require("node:child_process");

const root = process.argv[2];
const requireInterface = createRequire(
  join(root, "packages/interface-dms/package.json"),
);
const assert = require("node:assert/strict");
const {
  Action,
  Component,
  ComponentBuilder,
  ComponentTarget,
  getPermissionIdRef,
} = require(join(root, "packages/interface-dms/dist/component.js"));

async function observeTypeBoundaries() {
  const api = requireInterface("@antelopejs/interface-api");
  const { CreateJwtAuthDecorator } = requireInterface("./dist/auth/internal/jwt-auth-decorator.js");
  const { getAuthenticatedRequestTenantId } = requireInterface("./dist/auth/internal/request-authenticators.js");
  const { isPrimitive } = requireInterface("./dist/utils/internal/type-check.js");
  const { CreateDataType } = requireInterface("./dist/base/data-types/index.js");
  const { collectFileRefs, remapRecordFileKeys } = requireInterface("./dist/base/helpers/file-refs.js");
  const { RegistrationIdentity } = requireInterface("./dist/page/internal/registry.js");
  const priorProvider = api.SetParameterProvider;
  const authenticated = [];
  const reads = [];
  let provider;
  api.SetParameterProvider = (_target, _key, _index, value) => { provider = value; };
  try {
    for (const value of [null, false, 17, "plain", {}, { _id: 23 }, Object.assign(Object.create({
      get _id() { reads.push(this.marker === 31); return "user-31"; },
    }), { marker: 31 })]) {
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
  const keyReads = [];
  const node = Object.create({
    get key() { keyReads.push(this === node); return "image-17"; },
  });
  node.extra = 31;
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
      return Reflect.get(target, key, receiver);
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

async function observeUploadConstraintReads() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const uploads = requireInterface("./dist/uploads.js");
  const priorSigner = uploads.SignUploadToken;
  const observed = [];
  try {
    for (const mode of ["undefined", "null", "false", "number", "string", "array", "proxy"]) {
      const page = new PageMetadata(class ConstraintReadProbe {});
      page.skipComponentPermissions = true;
      page.componentMap.set("constraint.component", { access: "own" });
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
      const values = { undefined, null: null, false: false, number: 17, string: "plain", array: [], proxy };
      const options = {
        get constraints() { trace.push(["constraints", this === options]); return values[mode]; },
      };
      let constraints;
      uploads.SignUploadToken = async (registration) => {
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
  ].map((entry) => JSON.parse(execFileSync(process.execPath, ["-e", script, root, entry], { encoding: "utf8" })));
}

function observeDataTypesAndHints() {
  const { blockFetchUrlOption } = requireInterface("./dist/base/display.js");
  const { getUiHints } = requireInterface(
    "./dist/base/block-registry/internal/ui.js",
  );
  const { DataType, RegisterDataType, RegisterDataCompareMode, serializeType } =
    requireInterface("./dist/base/data-types/index.js");
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

async function observeRoutes() {
  const { GetMetadata } = requireInterface("@antelopejs/interface-core");
  const { TableViewMeta } = requireInterface("./dist/base/table-view/meta.js");
  const { createGuardedRoute } = requireInterface(
    "./dist/base/table-view/internal/guards.js",
  );
  const { withActionCheck } = requireInterface(
    "./dist/base/table-view/internal/auth.js",
  );
  const { withRealtimeMutation, withPresenceAcquire } = requireInterface(
    "./dist/base/table-view/internal/realtime.js",
  );
  const tenantAccess = requireInterface("./dist/tenant-access.js");
  class ProbeController {}
  const receiver = new Proxy(new ProbeController(), {});
  const meta = GetMetadata(ProbeController, TableViewMeta);
  meta.options.realtime = false;
  const calls = [];
  const context = { rawRequest: { headers: {} } };
  const params = { id: "row-31" };
  const body = Buffer.from('{"count":17,"discard":true}');
  const sentinel = { returned: 43 };
  const base = {
    method: "post",
    args: [],
    async func(...args) {
      calls.push({
        receiver: this === receiver,
        context: args[0] === context,
        params: args[1] === params,
        tail: args.slice(2),
      });
      return sentinel;
    },
  };
  const mutation = withRealtimeMutation(
    { eventType: "updated", extractIds: () => [] },
    base,
  );
  const presence = withPresenceAcquire(base);
  const mutationResult = await mutation.func.call(
    receiver,
    context,
    params,
    "left",
    47,
    context,
    "session-1",
    { _id: "user-1" },
  );
  const presenceResult = await presence.func.call(
    receiver,
    context,
    params,
    "right",
    53,
    context,
    "session-2",
    "1",
    { _id: "user-2" },
  );
  const previousGate = tenantAccess.CheckTenantAccess;
  const gates = [];
  tenantAccess.CheckTenantAccess = async (...args) => {
    gates.push(args);
    return { allowed: true };
  };
  let authResult;
  try {
    authResult = await withActionCheck("probe", base).func.call(
      receiver,
      context,
      params,
      "auth",
      59,
      { _id: "user-3" },
    );
  } finally {
    tenantAccess.CheckTenantAccess = previousGate;
  }
  const events = [];
  meta.setControllerGuards({
    new: function (_context, { body: value }) {
      events.push({ guardReceiver: this === receiver });
      value.count += 7;
      delete value.discard;
      return () => events.push("after");
    },
  });
  const guarded = createGuardedRoute(
    {
      ...base,
      async func(...args) {
        events.push("write");
        return base.func.apply(this, args);
      },
    },
    "new",
  );
  const guardResult = await guarded.func.call(
    receiver,
    context,
    params,
    body,
    "trailing",
  );
  meta.setControllerGuards({});
  let untouched;
  await createGuardedRoute(
    {
      ...base,
      func: async (_context, _params, value) => {
        untouched = value === body;
      },
    },
    "new",
  ).func.call(receiver, context, params, body);
  return {
    calls,
    events,
    gates,
    untouched,
    results: [mutationResult, presenceResult, authResult, guardResult].map(
      (result) => result === sentinel,
    ),
    decoratorArgs: [mutation.args.length, presence.args.length],
  };
}

function observeFactoryHelpers() {
  const helpers = requireInterface(
    "./dist/base/table-view/internal/factory-helpers.js",
  );
  const flags = [
    "hasNewForm",
    "hasEditForm",
    "hasViewForm",
    "hasDeleteEndpoint",
    "archiveMode",
    "isExportEnabled",
    "formsArePages",
  ];
  const actions = Array.from({ length: 128 }, (_, mask) => {
    const capabilities = Object.fromEntries(
      flags.map((flag, index) => [flag, !!(mask & (1 << index))]),
    );
    const builder = new ComponentBuilder("capabilities").options({});
    helpers.registerTableViewActions(builder, capabilities);
    return Object.entries(builder.actions).map(([id, action]) => [
      id,
      action.definition,
    ]);
  });
  const frames = [
    { pageSlug: "/work/:id", formSlug: "/work/:id/items/:id/edit" },
    { pageSlug: "/:id/:id", formSlug: "/:id/:id/items/:id/edit" },
    { pageSlug: "/plain", formSlug: "/plain/items/new" },
  ];
  const routes = frames.map((frame) => ({
    redirect: helpers.buildFormRedirectUrl(frame),
    defaults: helpers.buildFilterSubmitDefaults(
      {
        queryParamFilters: { search: { field: "query" } },
        routeParamFilters: { id: { field: "owner" } },
      },
      frame,
    ),
  }));
  const urls = [
    undefined,
    {
      new: { urlSlug: "../create" },
      edit: { urlSlug: "/absolute/:id" },
      details: { urlSlug: "nested/:id" },
    },
  ].map((pages) => helpers.buildFormPageUrls("/work/:id/", "items", pages));
  const displays = helpers.serializeTableViewDisplays({
    displays: [{ id: "cards" }, { id: "kanban", options: { marker: 9 } }],
    card: { fields: ["name"], minWidth: 317, skeletonHeight: 91 },
    kanban: { groupBy: "status" },
  });
  const rowActions = helpers.serializeRowActions({
    add: { confirm: { title: "Add" } },
    edit: true,
    delete: { rule: { field: "status", equals: "draft" } },
    custom: [
      { id: "open", label: "Open", target: { type: "url", url: "/open" } },
    ],
  });
  return { actions, routes, urls, displays, rowActions };
}

function observePageInfoPrecedence() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const { GetMetadata } = requireInterface("@antelopejs/interface-core");
  const results = [];
  for (const mode of ["explicit", "menu", "ancestor", "default", "controller"]) {
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
          return Reflect.get(target, key, receiver);
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
        return Reflect.get(target, key, receiver);
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
    const snapshot = {
      ...info,
      category: info.category?.fullId,
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

function observePageAndTableMetadata() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const { TableViewMeta } = requireInterface("./dist/base/table-view/meta.js");
  class ParentController {}
  class ChildController {}
  const parent = new PageMetadata(ParentController);
  parent.SetInfo(
    "parent",
    "/work/:id",
    {
      displayName: "Parent",
      hidden: true,
    },
    { componentName: "parent-layout" },
  );
  const child = new PageMetadata(ChildController);
  child.SetInfo(
    "child",
    "/work/:id/child",
    {
      displayName: "Child",
      category: parent.pageInfo,
    },
    { componentName: "child-layout" },
  );
  const first = new ComponentBuilder("first").options({ marker: 11 });
  const second = new ComponentBuilder("second").options({ marker: 23 });
  parent.SetComponent("first", first);
  child.SetComponent("second", second);
  child.inherit(parent);
  const meta = new TableViewMeta(ParentController);
  meta.addComponentBuilder(first, "write");
  meta.addComponentBuilder(second, "read");
  meta.addComponentBuilder(first, "write");
  meta.recordGateBypassRegistration(false);
  meta.recordGateBypassRegistration(true);
  meta.setOptions({ caption: "Parent", rowIdKey: "identity" });
  const inherited = new TableViewMeta(ChildController);
  inherited.inherit(meta);
  return {
    pageInfo: child.pageInfo,
    layout: child.layout,
    componentKeys: Object.keys(child.components),
    componentIdentity: [
      child.components.first === first,
      child.components.second === second,
    ],
    targetIdentity: [
      parent.target === ParentController,
      child.target === ChildController,
    ],
    builderIdentity: meta.componentBuilders.map((builder) =>
      builder === first ? "first" : "second",
    ),
    writers: meta.writingComponentBuilders.map((builder) => builder === first),
    mixedGateRegistrations: meta.hasMixedGateBypassRegistrations,
    inheritedOptions: inherited.options,
    copiedOptions: inherited.options !== meta.options,
    inheritedBuilders: inherited.componentBuilders.length,
  };
}

async function observeTableViewLifecycle() {
  const { TableView } = requireInterface("./dist/base/table-view/factory.js");
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const { permissionMap } = requireInterface(
    "./dist/page/internal/registry.js",
  );
  const permissions = requireInterface("./dist/permissions.js");
  const { GetMetadata } = requireInterface("@antelopejs/interface-core");
  const { DataAPIMeta } = requireInterface(
    "@antelopejs/interface-data-api/metadata",
  );
  const previous = permissions.HasPermission;
  const calls = [];
  permissions.HasPermission = async (held, id) => {
    calls.push(id);
    return held.has(id);
  };
  try {
    const results = [];
    for (const type of ["drawer", "page"]) {
      class Controller {}
      class Table {}
      Controller.location = "/probe";
      GetMetadata(Controller, DataAPIMeta).tableClass = Table;
      const builder = TableView(Controller, {
        caption: "Lifecycle",
        realtime: false,
        formContainer: { type },
        rowClick: "double",
        rowIdKey: "identity",
      });
      const receiver = new Proxy(builder, {});
      const parent = new PageMetadata(class PageController {});
      parent.SetInfo(
        "page",
        "/work/:id",
        {
          displayName: "Page",
        },
        { componentName: "layout" },
      );
      permissionMap.set(builder, "page.table");
      permissionMap.set(parent.target, "page");
      receiver.onPageCreated(parent);
      const serialized = receiver.serializeSync();
      const filtered = await receiver.onFilterCallback(
        new Set(["page.table.edit", "page.table.view"]),
        serialized.options,
        "page.table",
        { tenantId: "tenant" },
      );
      let missingPage;
      try {
        receiver.onPageCreated(new PageMetadata(class EmptyPage {}));
      } catch (error) {
        missingPage = error.message;
      }
      results.push({
        serialized,
        filtered,
        missingPage,
        optionKeys: Object.keys(serialized.options),
        actions: Object.keys(builder.actions),
      });
      permissionMap.delete(builder);
      permissionMap.delete(parent.target);
    }
    return { results, permissionCalls: calls };
  } finally {
    permissions.HasPermission = previous;
  }
}

async function observeExtractedPageCalls() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const api = requireInterface("@antelopejs/interface-api");
  const permissions = requireInterface("./dist/permissions.js");
  const { pageLayoutHandlers } = requireInterface("./dist/page/internal/registry.js");
  const priorRegister = api.RegisterRoute;
  const priorUnregister = api.UnregisterRoute;
  const priorPermission = permissions.HasPermission;
  let route;
  const calls = [];
  const page = new PageMetadata(class ForwardingProbe {});
  api.RegisterRoute = (value) => {
    route = value;
    return "extraction-probe";
  };
  api.UnregisterRoute = () => {};
  try {
    page.resolvePageLayout = function (...args) {
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
        return Reflect.get(target, key, receiver);
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
      return Reflect.get(target, key, owner);
    },
  });
  await receiver.bindUploadOptions({ a: { b: 17 } }, "probe", "page.probe", []);
  return { calls, pageInfoReads, layout, recursiveMethodReads };
}

async function observeEvaluationOrder() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const fresh = () => new PageMetadata(class EvaluationOrderProbe {});
  const results = {};
  results.publish = [false, true].map((readAuthOnly) => {
    const page = fresh();
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
      if (error.message !== "order-stop") throw error;
    }
    const state = { trace, moduleScoped: page.moduleScoped };
    page.Dispose();
    return state;
  });
  const api = requireInterface("@antelopejs/interface-api");
  const register = api.RegisterRoute;
  const unregister = api.UnregisterRoute;
  let route;
  api.RegisterRoute = (value) => { route = value; return "order-route"; };
  api.UnregisterRoute = () => {};
  try {
    class First {}
    class Second {}
    const trace = [];
    let reads = 0;
    const receiver = new Proxy(fresh(), {
      get(target, key, owner) {
        if (key === "target") {
          trace.push(["target", ++reads, owner === receiver]);
          return reads === 1 ? First : Second;
        }
        return Reflect.get(target, key, owner);
      },
    });
    receiver.registerLayoutRoute({
      fullSlug: "/order-route",
      get layoutUrl() { trace.push(["layoutUrl"]); return "/order-route/layout"; },
    });
    results.layoutRoute = { trace: [...trace], secondPrototype: route.proto === Second.prototype };
    receiver.Dispose();
  } finally {
    api.RegisterRoute = register;
    api.UnregisterRoute = unregister;
  }
  results.notify = ["absent", "replace", "distinct"].map((mode) => {
    const page = fresh();
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
        return function (owner) {
          calls++;
          trace.push(["call", this === component, owner === page]);
        };
      },
    };
    page.notifyPageCreated({ component, depth: 0, permissionId: "order.component" });
    return { mode, trace, calls, firstContains: first.has(component), secondContains: second.has(component) };
  });
  results.addExtension = [];
  for (const throws of [false, true]) {
    const page = fresh();
    page.takenComponentKeys = () => new Map();
    const stale = page.extensionEntries;
    const replacement = new Map();
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
      if (!throws || error.message !== "order-stop") throw error;
    }
    results.addExtension.push({ throws, trace, liveContains: replacement.has(info), staleContains: stale.has(info) });
  }
  results.takenKeys = [false, true].map((throws) => {
    const page = fresh();
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
    let keys;
    try {
      keys = [...page.takenComponentKeys()];
    } catch (error) {
      if (!throws || error.message !== "order-stop") throw error;
    }
    return { throws, trace, keys: keys ?? null };
  });
  assert.deepEqual(results, {
    publish: [
      { trace: [["noComponentPermissions", true, true]], moduleScoped: true },
      { trace: [["noComponentPermissions", true, true], ["authOnly", true, true]], moduleScoped: true },
    ],
    layoutRoute: {
      trace: [["target", 1, true], ["layoutUrl"], ["target", 2, true]],
      secondPrototype: true,
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

async function observeOwnerAccessorOrder() {
  const { PageMetadata } = requireInterface("./dist/page/metadata.js");
  const { pageExtensions } = requireInterface("./dist/page/internal/registry.js");
  const results = {};
  const expected = {};
  const failures = [];
  const cases = {
    async preparePermissionId() {
      const page = new PageMetadata(class PrepareOwnerAccessorProbe {});
      page.skipComponentPermissions = true;
      page.pagePermissionId = "before";
      const component = new ComponentBuilder("child").options({ marker: 17 });
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
      const trace = [];
      const bind = page.bindNativeUploadFields;
      Object.defineProperty(page, "bindNativeUploadFields", {
        get() {
          trace.push(["get", this === page]);
          child.id = "after";
          return async function (...args) {
            trace.push(["call", this === page, args.length, args[0] === component, args[1]]);
          };
        },
      });
      await bind.call(page, serialized, "page.child");
      return trace;
    },
    async extensionPrepareComponent() {
      return extensionComponent(false);
    },
    async extensionUnregisterComponent() {
      return extensionComponent(true);
    },
    async unregisterNodeComponent() {
      const page = new PageMetadata(class UnregisterNodeOwnerAccessorProbe {});
      page.registersComponentPermissions = () => true;
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
      const bind = page.bindUploadOptions;
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
  async function extensionComponent(throws) {
    const page = new PageMetadata(class ExtensionOwnerAccessorProbe {});
    const before = new ComponentBuilder("before").options({ marker: "before" });
    const after = new ComponentBuilder("after").options({ marker: "after" });
    const contribution = { key: "child", component: before };
    const info = {
      extensionName: "owner-accessor-probe",
      targetFullId: `owner-accessor-probe-${throws}`,
      components: [contribution],
    };
    const trace = [];
    page.prepareComponent = function (...args) {
      trace.push(["prepare", this === page, args.length, args[0].serializeSync().options.marker, args[1]]);
      throw new Error("owner-accessor-prepare-stop");
    };
    Object.defineProperty(page, throws ? "unregisterComponent" : "prepareComponent", {
      get() {
        trace.push(["get", this === page]);
        contribution.component = after;
        return function (...args) {
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
    throw new AggregateError(failures, `Owner accessor order failed: ${JSON.stringify(results)}\n${failures.map((error) => error.stack).join("\n")}`);
  }
  return results;
}

async function observePublicWatchFilterOrder() {
  const { GetMetadata } = requireInterface("@antelopejs/interface-core");
  const { DataAPIMeta } = requireInterface("@antelopejs/interface-data-api/metadata");
  const { TableView } = requireInterface("./dist/base/table-view/factory.js");
  const results = [];
  for (let trial = 0; trial < 3; trial++) {
    class Controller {}
    class Table {}
    Controller.location = "/probe";
    GetMetadata(Controller, DataAPIMeta).tableClass = Table;
    let expired = false;
    let reads = 0;
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
    const result = await builder.onFilterCallback(new Set(["*"]), options, "page.table", {});
    results.push({ trace, watches: result.watchActions.length });
  }
  assert.deepEqual(results, Array.from({ length: 3 }, () => ({
    trace: ["watchFilter", "expire"],
    watches: 1,
  })), "A forwarding async callback must not delay the public watchFilter");
  return results;
}

async function observePublicPageScheduling() {
  const { ImplementInterface } = requireInterface("@antelopejs/interface-core");
  const { PageMetadata, GetPageLayoutBySlug } = requireInterface("./dist/page.js");
  const { SignUploadToken } = requireInterface("./dist/uploads.js");
  ImplementInterface({ SignUploadToken }, { SignUploadToken: async () => "timing-token" });
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
    let rejected;
    assert.doesNotThrow(() => {
      rejected = layout({ get query() { throw failure; } });
    });
    await assert.rejects(rejected, error => error === failure);
    return trace;
  } finally {
    active = false;
    page.Dispose();
  }
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
  const filtered = await view.onFilterCallback(
    new Set(["page.component.refresh"]),
    serialized.options,
    "page.component",
    { tenantId: "tenant", user: undefined },
  );
  const shadowedCallFilter = Object.assign(
    function (_permissions, options) {
      return { ...options, receiver: this.metadata.name };
    },
    { call: undefined },
  );
  const shadowedCallBuilder = new ComponentBuilder("probe")
    .options({ x: 17 })
    .onFilter(shadowedCallFilter);
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
  const priorGet = getPermissionIdRef.get;
  getPermissionIdRef.get = (component) =>
    component === plain ? "page.plain" : undefined;
  const action = new Action(
    "edit",
    { title: "Edit", dependencies: ["view"] },
    plain,
  );
  const permission = action.toPermission();
  getPermissionIdRef.get = priorGet;
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
    typeBoundaries: await observeTypeBoundaries(),
    uploadConstraintReads: await observeUploadConstraintReads(),
    defaultTypesFresh: observeDefaultTypesFresh(),
    dataTypesAndHints: observeDataTypesAndHints(),
    routes: await observeRoutes(),
    factoryHelpers: observeFactoryHelpers(),
    metadata: observePageAndTableMetadata(),
    pageInfoPrecedence: observePageInfoPrecedence(),
    lifecycle: await observeTableViewLifecycle(),
    extractedPageCalls: await observeExtractedPageCalls(),
    evaluationOrder: await observeEvaluationOrder(),
    ownerAccessorOrder: await observeOwnerAccessorOrder(),
    publicWatchFilterOrder: await observePublicWatchFilterOrder(),
    publicPageScheduling: await observePublicPageScheduling(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stderr.write(String(error.stack));
    process.exitCode = 1;
  });
