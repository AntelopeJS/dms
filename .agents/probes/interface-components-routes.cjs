const path = require("node:path");

const { createRequire } = require("node:module");

const root = process.argv[2];

const requireInterface = createRequire(
  path.join(root, "packages/interface-dms/package.json"),
);

/**
 * @typedef {{
 *   "./dist/component.js": typeof import("../../packages/interface-dms/dist/component.js");
 *   "./dist/page/internal/registry.js": typeof import("../../packages/interface-dms/dist/page/internal/registry.js");
 *   "./dist/page/metadata.js": typeof import("../../packages/interface-dms/dist/page/metadata.js");
 *   "@antelopejs/interface-core": typeof import("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
 *   "./dist/base/table-view/meta.js": typeof import("../../packages/interface-dms/dist/base/table-view/meta.js");
 *   "./dist/base/table-view/internal/guards.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/guards.js");
 *   "./dist/base/table-view/internal/auth.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/auth.js");
 *   "./dist/base/table-view/internal/realtime.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/realtime.js");
 *   "./dist/tenant-access.js": typeof import("../../packages/interface-dms/dist/tenant-access.js");
 *   "./dist/base/table-view/internal/factory-helpers.js": typeof import("../../packages/interface-dms/dist/base/table-view/internal/factory-helpers.js");
 *   "./dist/base/table-view/factory.js": typeof import("../../packages/interface-dms/dist/base/table-view/factory.js");
 *   "./dist/permissions.js": typeof import("../../packages/interface-dms/dist/permissions.js");
 *   "@antelopejs/interface-data-api/metadata": typeof import("../../packages/interface-dms/node_modules/@antelopejs/interface-data-api/dist/metadata.js");
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

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : undefined;
}

const {
  ComponentBuilder,
} = loadInterface("./dist/component.js");

/**
 * @param {InterfaceModules["./dist/tenant-access.js"]} tenantAccess
 */
function openTenantGate(tenantAccess) {
  const previousGate = tenantAccess.CheckTenantAccess;
  /** @type {unknown[]} */
  const gates = [];
  tenantAccess.CheckTenantAccess = async (/** @type {unknown[]} */ ...args) => {
    gates.push(args);
    return { allowed: true };
  };
  return {
    gates,
    restore() {
      tenantAccess.CheckTenantAccess = previousGate;
    },
  };
}

/**
 * @param {object} receiver
 */
function bodyRewritingGuards(receiver) {
  /** @type {unknown[]} */
  const events = [];
  return {
    events,
    guards: {
      /**
       * @this {object}
       * @param {unknown} _context
       * @param {{ body: { count: number, discard?: unknown } }} request
       */
      new: function (_context, { body: value }) {
        events.push({ guardReceiver: this === receiver });
        value.count += 7;
        delete value.discard;
        return () => events.push("after");
      },
    },
  };
}

async function observeRoutes() {
  const { GetMetadata } = loadInterface("@antelopejs/interface-core");
  const { TableViewMeta } = loadInterface("./dist/base/table-view/meta.js");
  const { createGuardedRoute } = loadInterface(
    "./dist/base/table-view/internal/guards.js",
  );
  const { withActionCheck } = loadInterface(
    "./dist/base/table-view/internal/auth.js",
  );
  const { withRealtimeMutation, withPresenceAcquire } = loadInterface(
    "./dist/base/table-view/internal/realtime.js",
  );
  const tenantAccess = loadInterface("./dist/tenant-access.js");
  class ProbeController {}
  const receiver = new Proxy(new ProbeController(), {});
  const meta = GetMetadata(ProbeController, TableViewMeta);
  meta.options.realtime = false;
  /** @type {unknown[]} */
  const calls = [];
  const context = { rawRequest: { headers: {} } };
  const params = { id: "row-31" };
  const body = Buffer.from('{"count":17,"discard":true}');
  const sentinel = { returned: 43 };
  const base = {
    method: "post",
    args: [],
    /**
     * @this {object}
     * @param {unknown[]} args
     */
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
  /** @type {unknown} */
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
  /** @type {unknown} */
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
  const gate = openTenantGate(tenantAccess);
  /** @type {unknown} */
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
    gate.restore();
  }
  const { events, guards } = bodyRewritingGuards(receiver);
  meta.setControllerGuards(guards);
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
  /** @type {unknown} */
  const guardResult = await guarded.func.call(
    receiver,
    context,
    params,
    body,
    "trailing",
  );
  meta.setControllerGuards({});
  /** @type {boolean | undefined} */
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
    gates: gate.gates,
    untouched,
    results: [mutationResult, presenceResult, authResult, guardResult].map(
      (result) => result === sentinel,
    ),
    decoratorArgs: [mutation.args.length, presence.args.length],
  };
}

function observeFactoryHelpers() {
  const helpers = loadInterface(
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

function observePageAndTableMetadata() {
  const { PageMetadata } = loadInterface("./dist/page/metadata.js");
  const { TableViewMeta } = loadInterface("./dist/base/table-view/meta.js");
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
  const { TableView } = loadInterface("./dist/base/table-view/factory.js");
  const { PageMetadata } = loadInterface("./dist/page/metadata.js");
  const { permissionMap } = loadInterface(
    "./dist/page/internal/registry.js",
  );
  const permissions = loadInterface("./dist/permissions.js");
  const { GetMetadata } = loadInterface("@antelopejs/interface-core");
  const { DataAPIMeta } = loadInterface(
    "@antelopejs/interface-data-api/metadata",
  );
  const previous = permissions.HasPermission;
  /** @type {unknown[]} */
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
      /** @type {unknown} */
      const filtered = await receiver.onFilterCallback(
        new Set(["page.table.edit", "page.table.view"]),
        serialized.options,
        "page.table",
        { tenantId: "tenant" },
      );
      /** @type {string | undefined} */
      let missingPage;
      try {
        receiver.onPageCreated(new PageMetadata(class EmptyPage {}));
      } catch (error) {
        missingPage = messageOf(error);
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

async function observe() {
  return {
    routes: await observeRoutes(),
    factoryHelpers: observeFactoryHelpers(),
    metadata: observePageAndTableMetadata(),
    lifecycle: await observeTableViewLifecycle(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((/** @type {unknown} */ error) => {
    process.stderr.write(String(error instanceof Error ? error.stack : error));
    process.exitCode = 1;
  });
