"use strict";

const assert = require("node:assert/strict");
const { createRequire } = require("node:module");
const { join, relative, resolve, sep } = require("node:path");
const { mkdirSync, rmSync, writeFileSync } = require("node:fs");
const { spawnSync } = require("node:child_process");

const root = resolve(process.argv[2]);
const load = createRequire(join(root, "packages/dms/package.json"));

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
const runtime = JSON.parse(fresh.stdout);

const { IsInterfaceProxy } = load("@antelopejs/interface-core");
const declaration = load("@antelopejs/interface-dms/page");
const implementation = load(
  join(root, "packages/dms/dist/implementations/dms/page.js"),
);

function describe(handler) {
  assert.equal(typeof handler, "function");
  return {
    name: handler.name,
    length: handler.length,
    async: handler.constructor.name === "AsyncFunction",
  };
}

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
        return [
          [`${path}.register`, describe(implemented[key].register)],
          [`${path}.unregister`, describe(implemented[key].unregister)],
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

const { compileRowRule } = load(
  join(root, "packages/dms/dist/implementations/dms-base/footer-summary.js"),
);
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
  const fs = load("node:fs");
  const { Readable } = load("node:stream");
  const storage = load("@antelopejs/interface-file-storage");
  const { uploadExportToStorage } = load(
    join(root, "packages/dms/dist/utils/export-jobs.js"),
  );
  const original = {
    stat: fs.promises.stat,
    unlink: fs.promises.unlink,
    createReadStream: fs.createReadStream,
    toWeb: Readable.toWeb,
    createUploadUrl: storage.CreateUploadUrl,
    fetch: globalThis.fetch,
  };
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
    globalThis.fetch = async (url) => {
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
    Readable.toWeb = original.toWeb;
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
  .catch((error) => {
    process.stderr.write(String(error) + "\n");
    process.exitCode = 1;
  });

function observeBootedRegistries() {
  const name = `backend-runtime-${process.pid}`;
  const directory = join(root, "packages/dms/dist/test", name);
  const marker = "BACKEND_RUNTIME_REGISTRIES=";
  mkdirSync(directory, { recursive: true });
  try {
    writeFileSync(join(directory, "probe.test.js"), `
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
`, join(root, "packages/dms"), join(directory, "probe.test.js")], {
      cwd: join(root, "packages/dms"),
      env: { ...process.env, DMS_PREBUILT: "1", DMS_TEST_DIR: `dist/test/${name}` },
      encoding: "utf8",
      timeout: 180000,
      maxBuffer: 16 * 1024 * 1024,
    });
    if (boot.error) throw boot.error;
    assert.equal(boot.status, 0, boot.stdout + boot.stderr);
    const lines = boot.stdout.split("\n").filter((line) => line.includes(marker));
    assert.equal(lines.length, 1, boot.stdout + boot.stderr);
    return JSON.parse(lines[0].slice(lines[0].indexOf(marker) + marker.length));
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

function observeRuntime() {
  const Module = require("node:module");
  const contract = baselineContract();
  const dist = join(root, "packages/dms/dist");
  const inside = (file) => file.startsWith(dist + sep);
  const moduleName = (file) => relative(dist, file).split(sep).join("/");
  const keyInfo = (key) => typeof key === "symbol"
    ? { symbol: String(key), global: Symbol.keyFor(key) ?? null }
    : key;
  const functionInfo = (fn) => {
    let constructible = true;
    try {
      Reflect.construct(Object, [], fn);
    } catch {
      constructible = false;
    }
    return { ...describe(fn), constructible };
  };
  const typeInfo = (value) => {
    if (value === undefined) return { kind: "undefined" };
    if (value === null) return { kind: "null" };
    if (Array.isArray(value)) return { kind: "array", values: value.map(typeInfo) };
    if (typeof value === "function") return { kind: "function", ...functionInfo(value) };
    return { kind: typeof value, value: String(value) };
  };
  const propertyInfo = (object) => {
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
  };

  createRequire(load.resolve("@antelopejs/interface-core"))("reflect-metadata");
  assert.equal(typeof Reflect.decorate, "function");
  assert.equal(typeof Reflect.getOwnMetadata, "function");
  const originalCompile = Module.prototype._compile;
  const originalDecorate = Reflect.decorate;
  const originalMetadata = Reflect.metadata;
  const reached = new Set();
  const decorated = [];
  const applications = [];
  const metadataDecorators = new WeakMap();
  const targetInfo = (target, key) => ({
    class: typeof target === "function" ? target.name : target.constructor?.name,
    placement: typeof target === "function" ? "static" : "prototype",
    member: key === undefined ? null : keyInfo(key),
  });

  Module.prototype._compile = function (source, filename, ...rest) {
    if (inside(filename)) reached.add(filename);
    return Reflect.apply(originalCompile, this, [source, filename, ...rest]);
  };
  Reflect.metadata = function (key, value) {
    const decorator = Reflect.apply(originalMetadata, this, [key, value]);
    metadataDecorators.set(decorator, { key: typeInfo(key), value: typeInfo(value) });
    return decorator;
  };
  Reflect.decorate = function (decorators, target, key, descriptor) {
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
    record.result = Reflect.apply(originalDecorate, this, args);
    return record.result;
  };

  try {
    const entry = join(dist, "index.js");
    load(entry);
    const implementationEntries = contract.implementationEntries.map((name) => {
      const file = join(dist, name);
      const exports = load(file);
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
      const originalFile = join(dist, name);
      const file = reached.has(originalFile) ? originalFile
        : join(dist, contract.moves[name] ?? name);
      assert.ok(reached.has(file), `Baseline module not reached ${name}`);
      const cached = require.cache[file];
      assert.ok(cached, `Missing loaded module ${moduleName(file)}`);
      const originalKeys = contract.privateBarrels[name];
      const keep = originalKeys
        ? (key) => originalKeys.includes(key)
        : () => true;
      if (originalKeys) {
        for (const key of originalKeys) {
          assert.ok(Object.hasOwn(cached.exports, key), `Missing baseline export ${name}.${key}`);
        }
      }
      return {
        module: name,
        ownKeys: Reflect.ownKeys(cached.exports).filter(keep).map(keyInfo),
        properties: propertyInfo(cached.exports).filter((item) => keep(item.key)),
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

function baselineContract() {
  const inventory = {
    "attachments/": "access bindings constraints fields read registry save table-view uploads",
    "automation/": "actions events i18n index registration-lifecycle send-notification sources triggers",
    "": "client-origin-cors config frontend-module index startup-config",
    "crons/": "cleanup-user-invites index sweep-expired-sessions sweep-stale-exports",
    "db/": "index",
    "db/models/": "attachments.model index notification-feed-filter signInAttempts.model systemState.model userEmailChanges.model userKnownDevices.model userNotificationPreferences.model userNotifications.model",
    "db/tables/": "attachments.table index signInAttempts.table systemState.table userEmailChanges.table userKnownDevices.table userNotificationPreferences.table userNotifications.table",
    "dev/": "module-update-notifications",
    "hooks/": "invite-extensions tenant-deleted workspace-notifications",
    "implementations/dms-auth/": "account-emails index session-handoff token-secret token-session",
    "implementations/dms-base/": "bulk-selection export-jobs filter-tokens footer-summary search-route table-view tenant-export-archive",
    "implementations/dms-html-render/": "constants index service-jwt template-registry",
    "implementations/dms-notifications/": "delivery-dedupe delivery-guard index registry",
    "implementations/dms/": "api-base-url attachments client-base-url client-ip dev-handshake dev-reload frontend-backend-proxies frontend-bootstrap frontend-modules frontend-public-endpoints frontend-ready guards invite-extensions layout-banners manifest menu-categories nav-badges page permission-preview permissions-resolver permissions quick-actions realtime resolver-timeout route-params saas-mode stale-session tenant-access uploads warn-once",
    "page-extensions/": "pending-report",
    "pages/": "index",
    "pages/modules/": "index modules-index modules-store",
    "pages/public/auth/": "2fa accounts backup forgot-validation forgot login oauth-complete recover-success recover signup validate",
    "pages/public/": "index",
    "pages/public/onboarding/": "index",
    "pages/public/preview/": "block-types fixtures index",
    "pages/settings/": "index settings-index",
    "pages/settings/overview/": "account-activity account-summary",
    "pages/settings/users/": "account-activity-feed account-activity-store account-activity account-credentials account-data-store account-data appearance category current-password dashboard-languages email-change index invite-email-outcome invite-extension-routes invite-resend invites member-change-notifications member-invite-batch member-invite-form member-management member-role-options member-roles-field members notifications permission-tree-nodes permission-warnings profile-access profile-helpers profile quick-actions region-form region regional-preferences role-editor-store role-editor role-preview roles security-attention security shortcuts two-factor-operations",
    "realtime/": "broker current heartbeat index instance presence redis-broker registry sessions sse table-view",
    "routes/": "auth block-preview files index onboarding realtime store system-state",
    "routes/auth/": "client-ip constants forgot-password index invite login-throttle login logout me pick-tenant refresh request-2fa-email request-email-verification reset-code reset-password session-handoff session-response signup switch-tenant two-factor-throttle types validate-forgot-password-token validate-invite-token verify-2fa verify-email",
    "routes/auth/oauth/": "authorize-url callback config identity-resolution index linking-policy providers relay state token-exchange",
    "store/": "activity cache catalog compatibility declarations frontend-compatibility interfaces listing operations registry requirements runtime tarball",
    "utils/": "account-notifications admin-invite-email attempt-limiter auth-key email-change-mail email-subjects ensure-default-tenant export-jobs-run export-jobs failed-sign-ins index notification-emitter notification-rules notification-tones one-time-code row-action-rule-evaluator run-in-batches sign-in-country sign-in-devices sign-in-monitor tenant-export-archive tenant-instances two-factor-codes upload-constraints upload-token user-activity user-agent workspace-notifications",
    "validation/": "account-deletion.schema auth.schema file.schema issue-message member-invite.schema member-ownership.schema password regional-preferences.schema role-editor.schema security.schema store.schema user-notification-preferences.schema",
    "validation/onboarding/": "index register-admin.schema",
  };
  const modules = Object.entries(inventory).flatMap(([directory, names]) =>
    names.split(" ").map((name) => `${directory}${name}.js`)).sort();
  assert.equal(modules.length, 273);
  const moves = {
    "config.js": "config/internal/state.js",
    "startup-config.js": "config/startup-config.js",
    "client-origin-cors.js": "config/client-origin-cors.js",
    "implementations/dms-notifications/registry.js": "utils/notification-registry.js",
    "routes/auth/client-ip.js": "utils/client-ip.js",
    "routes/auth/constants.js": "utils/auth-constants.js",
    "routes/auth/login-throttle.js": "utils/login-throttle.js",
    "routes/auth/request-email-verification.js": "utils/request-email-verification.js",
    "utils/sign-in-monitor.js": "hooks/internal/sign-in-monitor.js",
    "utils/workspace-notifications.js": "hooks/internal/workspace-notifications.js",
  };
  for (const name of ["dev-reload", "frontend-backend-proxies", "frontend-bootstrap",
    "frontend-modules", "frontend-public-endpoints", "frontend-ready", "manifest", "warn-once"]) {
    moves[`implementations/dms/${name}.js`] = `store/internal/frontend/${name}.js`;
  }
  const privateBarrels = {
    "automation/index.js": "__esModule registerAutomationNodes unregisterAutomationNodes listenersFor emitAutomationEvent",
    "db/index.js": "__esModule AttachmentModel SignInAttemptsModel SystemStateModel UserEmailChangesModel UserKnownDevicesModel UserNotificationPreferencesModel UserNotificationsModel buildNewUserNotification attachmentsTableName Attachment signInAttemptsTableName SignInAttempt systemStateTableName SystemState userEmailChangesTableName UserEmailChange userKnownDevicesTableName UserKnownDevice userNotificationPreferencesTableName UserNotificationPreferences userNotificationsTableName UserNotification",
    "db/models/index.js": "__esModule AttachmentModel SignInAttemptsModel SystemStateModel UserEmailChangesModel UserKnownDevicesModel UserNotificationPreferencesModel UserNotificationsModel buildNewUserNotification",
    "realtime/index.js": "__esModule getPresenceTracker getRealtimeBroker subscribeRealtime setRealtimeBroker configureRealtime stopRealtime EVERY_TENANT InMemoryBroker isEventForTenant instanceId PRESENCE_EVENT_TYPE PresenceTracker RedisBroker MENU_CHANGED_EVENT_TYPE MENU_BROADCAST_TOPIC buildMenuTopic buildMemberMenuTopic buildUserNotificationTopic registerPageTopic unregisterPageTopic clearPageTopics getPageTopics openSseStream",
    "routes/auth/index.js": "__esModule resolveClientIp resolveRequestClientIp trustedProxyCount forgotPassword login logout me buildOAuthAuthorizeUrl oauthCallback OAUTH_CALLBACK_PATH resolveOAuthPolicy listEnabledOAuthProviders describeEnabledOAuthProviders getEnabledOAuthProvider buildOAuthRedirectUri claimUnvalidatedAccount resolveOAuthUser decideOAuthResolution OAUTH_PROVIDERS deriveOAuthRelaySecret assertOAuthRelay signOAuthState assertValidOAuthState exchangeCodeForAccessToken HTTP_FORBIDDEN refresh request2FAEmail requestEmailVerification resetPassword redeemSessionHandoff issueAuthResponse resolveLoginOutcome signupLanguage signup switchTenant validateForgotPasswordToken validateInviteToken verify2FA verifyEmail",
    "utils/index.js": "__esModule ensureDefaultTenantExists provisionDefaultTenant DEFAULT_DELIVERY DEFAULT_EXPORT_FORMAT EMAIL_DELIVERY EXPORT_JOB_QUERY_PARAM EXPORT_TTL_MS DEFAULT_EXPORT_HISTORY_LIMIT getExporter readJobResult getDeliverer getExportLocalScratchPath uploadExportToStorage streamExportFromStorage deleteExportFromStorage sweepStaleExportsAllTenants deleteUserExportsInTenant deleteAllExportsForTenant buildExportFilename runExportJob loadExportJobForUser getExportJobExpiry getExportJobStatus listExportJobs downloadExportJob runInBatches TENANT_EXPORT_CONTENT_TYPE TENANT_EXPORT_EXTENSION buildTenantExportArchive startTenantExportJob getRowInstance MILLISECONDS_PER_SECOND MILLISECONDS_PER_MINUTE MILLISECONDS_PER_HOUR MILLISECONDS_PER_DAY assertPrimitiveValue parseValue parseObject isStringKeyword isStringNumber isStringDate isStringJSON registerTenantInstance registerExistingTenantInstances",
  };
  const implementationEntries = [
    "implementations/dms-auth/index.js",
    "implementations/dms-base/export-jobs.js",
    "implementations/dms-base/table-view.js",
    "implementations/dms-base/tenant-export-archive.js",
    "implementations/dms-html-render/index.js",
    "implementations/dms-notifications/index.js",
    ..."api-base-url attachments client-base-url client-ip guards invite-extensions layout-banners page permissions permissions-resolver quick-actions realtime saas-mode tenant-access uploads"
      .split(" ").map((name) => `implementations/dms/${name}.js`),
  ].sort();
  return {
    modules,
    moves,
    implementationEntries,
    privateBarrels: Object.fromEntries(Object.entries(privateBarrels)
      .map(([name, keys]) => [name, keys.split(" ")])),
  };
}
