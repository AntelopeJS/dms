const path = require("node:path");

const root = process.argv[2];

/** api-diff runs a scratch copy of this file, so relative requires must start from the tree under test. */
module.filename = path.join(root, ".agents/probes/interface-components-routes.cjs");

/**
 * @param {unknown} error
 * @returns {string | undefined}
 */
function messageOf(error) {
  return error instanceof Error ? error.message : undefined;
}

const {
  ComponentBuilder,
} = require("../../packages/interface-dms/dist/component.js");
const { IncomingMessage, ServerResponse } = require("node:http");
const { Socket } = require("node:net");
const untyped = require("./untyped/interface-components-routes.cjs");
const { HTTPResult } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
const { User } = require("../../packages/interface-dms/dist/auth/db/tables/users.table.js");

/**
 * A request context over an unconnected socket, with no headers.
 * @returns {import("../../packages/interface-dms/node_modules/@antelopejs/interface-api").RequestContext}
 */
function requestContext() {
  const rawRequest = new IncomingMessage(new Socket());
  rawRequest.headers = {};
  return {
    rawRequest,
    rawResponse: new ServerResponse(rawRequest),
    url: new URL("http://probe/"),
    routeParameters: {},
    response: new HTTPResult(),
  };
}

/**
 * @param {string} id
 */
function probeUser(id) {
  const user = new User();
  user._id = id;
  return user;
}

/**
 * @param {{ CheckTenantAccess: typeof import("../../packages/interface-dms/dist/tenant-access.js").CheckTenantAccess }} tenantAccess
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
       * @param {{ body: { count?: number, discard?: unknown } }} request
       */
      new: function (_context, request) {
        const value = request.body;
        events.push({ guardReceiver: this === receiver });
        const { count } = value;
        if (count === undefined) throw new TypeError("The guarded body has no count");
        value.count = count + 7;
        delete value.discard;
        return () => {
          events.push("after");
        };
      },
    },
  };
}

async function observeRoutes() {
  const { GetMetadata } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
  const { TableViewMeta } = require("../../packages/interface-dms/dist/base/table-view/meta.js");
  const { createGuardedWriteRoute } = require("../../packages/interface-dms/dist/base/table-view/internal/guards.js");
  const { withActionCheck } = require("../../packages/interface-dms/dist/base/table-view/internal/auth.js");
  const { withRealtimeMutation, withPresenceAcquire } = require("../../packages/interface-dms/dist/base/table-view/internal/realtime.js");
  const tenantAccess = require("../../packages/interface-dms/dist/tenant-access.js");
  class ProbeController {}
  const receiver = new Proxy(new ProbeController(), {});
  const meta = GetMetadata(ProbeController, TableViewMeta);
  meta.options.realtime = false;
  /** @type {unknown[]} */
  const calls = [];
  const context = requestContext();
  /**
   * One params object every route receives, so each base call can check it gets that exact object: the row id the edit, delete and mutation routes read, and a valid `new` route parameter, which takes only optional fields.
   * @type {{ id: string } & import("../../packages/interface-dms/node_modules/@antelopejs/interface-data-api/dist/components").Parameters.NewParameters}
   */
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
  const mutationResult = await untyped.callRoute(mutation, receiver, [
    context,
    params,
    "left",
    47,
    context,
    "session-1",
    probeUser("user-1"),
  ]);
  /** @type {unknown} */
  const presenceResult = await untyped.callRoute(presence, receiver, [
    context,
    params,
    "right",
    context,
    "session-2",
    "1",
    probeUser("user-2"),
  ]);
  const gate = openTenantGate(tenantAccess);
  /** @type {unknown} */
  let authResult;
  try {
    const checked = withActionCheck("probe", base);
    authResult = await checked.func.call(
      receiver,
      context,
      params,
      "auth",
      probeUser("user-3"),
    );
  } finally {
    gate.restore();
  }
  const { events, guards } = bodyRewritingGuards(receiver);
  meta.setControllerGuards(guards);
  const guarded = createGuardedWriteRoute(
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
  const unguarded = createGuardedWriteRoute(
    {
      ...base,
      func: async (_context, _params, value) => {
        untouched = value === body;
      },
    },
    "new",
  );
  await unguarded.func.call(receiver, context, params, body);
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
  const helpers = require("../../packages/interface-dms/dist/base/table-view/internal/factory-helpers.js");
  const actions = Array.from({ length: 128 }, (_, mask) => {
    const bit = (/** @type {number} */ index) => !!(mask & (1 << index));
    const capabilities = {
      hasNewForm: bit(0),
      hasEditForm: bit(1),
      hasViewForm: bit(2),
      hasDeleteEndpoint: bit(3),
      archiveMode: bit(4),
      isExportEnabled: bit(5),
      formsArePages: bit(6),
    };
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
  const displays = untyped.serializeTableViewDisplays({
    displays: [{ id: "cards" }, { id: "kanban", options: { marker: 9 } }],
    card: { fields: ["name"], minWidth: 317, skeletonHeight: 91 },
    kanban: { groupBy: "status" },
  });
  const rowActions = untyped.serializeRowActions({
    add: { confirm: { title: "Add" } },
    edit: true,
    delete: { rule: { field: "status", equals: "draft" } },
    custom: [{ id: "open", label: "Open", target: { type: "url", url: "/open" } }],
  });
  return { actions, routes, urls, displays, rowActions };
}

function observePageAndTableMetadata() {
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const { TableViewMeta } = require("../../packages/interface-dms/dist/base/table-view/meta.js");
  const { Controller } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  class ParentController extends Controller("") {}
  class ChildController extends Controller("") {}
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
  /** @type {ComponentBuilder<import("../../packages/interface-dms/dist/base/table-view.js").TableViewOptionsSerialized>} */
  const first = new ComponentBuilder("first");
  first.options({ enableTableExport: false, searchable: false, formComponents: {} });
  /** @type {ComponentBuilder<import("../../packages/interface-dms/dist/base/table-view.js").TableViewOptionsSerialized>} */
  const second = new ComponentBuilder("second");
  second.options({ enableTableExport: true, searchable: true, formComponents: {} });
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
  const { TableView } = require("../../packages/interface-dms/dist/base/table-view/factory.js");
  const { PageMetadata } = require("../../packages/interface-dms/dist/page/metadata.js");
  const { permissionMap } = require("../../packages/interface-dms/dist/page/internal/registry.js");
  const permissions = require("../../packages/interface-dms/dist/permissions.js");
  const { GetMetadata } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-core");
  const { DataAPIMeta } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-data-api/dist/metadata.js");
  const { Controller: ApiController } = require("../../packages/interface-dms/node_modules/@antelopejs/interface-api");
  const previous = permissions.HasPermission;
  /** @type {unknown[]} */
  const calls = [];
  permissions.HasPermission = async (held, id) => {
    calls.push(id);
    return held.has(id);
  };
  try {
    const results = [];
    /** @type {import("../../packages/interface-dms/dist/base/table-view.js").FormContainer["type"][]} */
    const containers = ["drawer", "page"];
    for (const type of containers) {
      class Controller extends ApiController("") {}
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
      class PageController extends ApiController("") {}
      const parent = new PageMetadata(PageController);
      parent.SetInfo(
        "page",
        "/work/:id",
        {
          displayName: "Page",
        },
        { componentName: "layout" },
      );
      permissionMap.set(builder, "page.table");
      permissionMap.set(PageController, "page");
      receiver.onPageCreated?.(parent);
      const serialized = receiver.serializeSync();
      /** @type {unknown} */
      const filtered = await receiver.onFilterCallback?.(
        new Set(["page.table.edit", "page.table.view"]),
        serialized.options,
        "page.table",
        { tenantId: "tenant", user: undefined },
      );
      /** @type {string | undefined} */
      let missingPage;
      try {
        receiver.onPageCreated?.(new PageMetadata(class EmptyPage extends ApiController("") {}));
      } catch (error) {
        missingPage = messageOf(error);
      }
      results.push({
        serialized,
        filtered,
        missingPage,
        optionKeys: Object.keys(serialized.options ?? {}),
        actions: Object.keys(builder.actions),
      });
      permissionMap.delete(builder);
      permissionMap.delete(PageController);
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
