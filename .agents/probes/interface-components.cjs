const { join } = require("node:path");
const { createRequire } = require("node:module");

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
    dataTypesAndHints: observeDataTypesAndHints(),
    routes: await observeRoutes(),
  };
}

observe()
  .then((result) => process.stdout.write(JSON.stringify(result)))
  .catch((error) => {
    process.stderr.write(String(error.stack));
    process.exitCode = 1;
  });
