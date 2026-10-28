"use strict";

const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const root = path.resolve(process.argv[2]);
const frontend = path.join(root, "packages/dms/frontend-vue");
const req = createRequire(path.join(frontend, "package.json"));
const ts = {
  ...req("typescript"),
  findConfigFile: () => path.join(root, ".dependency-cruiser.tsconfig.json"),
};
const sfc = req("@vue/compiler-sfc");
sfc.registerTS(() => ts);
const layers = path.join(frontend, "layers");
const componentManifest = {
  "dms-auth/app/components/": ["OAuthButtons.vue"],
  "dms-auth/app/custom-pages/auth/": [
    "2fa.vue",
    "backup.vue",
    "forgot-validation.vue",
    "login.vue",
    "oauth-complete.vue",
    "signup.vue",
    "validate.vue",
  ],
  "dms-layout/app/build/components/": [
    "layout/DashboardHeader.vue",
    "layout/DashboardSidePanel.vue",
    "layout/DashboardSidebar.vue",
    "layout/Footer.vue",
    "layout/PageHeaderActionBar.vue",
    "notification/NotificationPopover.vue",
    "pages/modules/ModuleStoreDependencyPicker.vue",
    "pages/modules/ModuleStoreOperation.vue",
    "pages/modules/ModuleTile.vue",
    "pages/settings/members/MemberRolePicker.vue",
    "pages/settings/notification/NotificationInboxDisplay.vue",
    "pages/settings/profile/ProfilePersonalInfo.vue",
    "pages/settings/profile/ProfileSummaryRow.vue",
    "pages/settings/roles/RolePanelHead.vue",
    "pages/settings/security/SecurityEditPanel.vue",
    "pages/settings/security/SecurityEmail.vue",
    "pages/settings/security/SecurityPanelField.vue",
    "pages/settings/security/SecuritySessions.vue",
    "pages/settings/security/SecurityStatus.vue",
    "pages/settings/security/SecurityTwoFactor.vue",
    "pages/settings/theme/CssVariablesList.vue",
    "pages/settings/theme/ThemePreview.vue",
  ],
  "dms-layout/app/components/": [
    "navigation/AccordionItemSync.vue",
    "navigation/NavigationMenu.vue",
  ],
  "dms-layout/app/custom-pages/settings/": ["roles.vue", "shortcuts.vue"],
  "dms-layout/app/emails/components/": ["EmailLayout.vue"],
  "dms-layout/app/": ["error.vue"],
  "dms-layout/app/pages/": ["[...slug].vue"],
  "dms-onboarding/app/build/components/": [
    "onboarding/StepIndicator.vue",
    "onboarding/steps/ready.vue",
  ],
  "dms-ui/app/build/components/": [
    "blocks/BlockActions.vue",
    "containers/drawer/DynamicDrawer.vue",
    "containers/modal/DynamicModal.vue",
    "containers/row/RowHeader.vue",
    "form/FormFieldControl.vue",
    "form/FormFieldNotes.vue",
    "form/PasswordInput.vue",
    "period/PeriodRangeCalendar.vue",
    "sortable/SortableList.vue",
    "stat/StatCell.vue",
    "table-view/CardAvatar.vue",
    "table-view/CardsDisplay.vue",
    "table-view/ExpandedRowDetail.vue",
    "table-view/IdentityCell.vue",
    "table-view/LiveHoldBanner.vue",
    "table/Actions.vue",
    "table/FiltersRow.vue",
    "table/Menu.vue",
    "table/MenuColumns.vue",
    "table/MenuDensity.vue",
    "table/MenuFilter.vue",
    "table/MenuImport.vue",
    "table/MenuPage.vue",
    "table/MenuRoot.vue",
    "table/MenuSort.vue",
    "table/MenuViewMode.vue",
    "table/Pagination.vue",
    "table/RowSelection.vue",
    "table/Table.vue",
    "table/Tabs.vue",
    "table/Views.vue",
  ],
  "dms-ui/app/components/": `
    PasswordStrength.vue RecursiveComponent.vue activity/ActivityItem.vue
    banner/Banner.vue block-preview/BlockPreview.vue blocks/BannerBlock.vue
    blocks/CardBlock.vue blocks/KeyValueListBlock.vue blocks/LiveToggleBlock.vue
    card/Card.vue card/NavCard.vue chart/ApexChartHost.vue chart/Chart.vue
    chart/internal/Sparkline.vue check-list/CheckList.vue check-list/PasswordRules.vue
    code-snippet/CodeSnippet.vue confirm/ConfirmModal.vue empty-state/EmptyState.vue
    field-row/FieldRow.vue flow-canvas/FlowCanvas.vue form/Form.vue form/LocalizedField.vue
    icon-well/IconWell.vue key-value-list/KeyValueList.vue link/AutoLink.vue
    list-row/ListRow.vue master-detail/MasterDetail.vue meter/Meter.vue meter/MeterBlock.vue
    period/PeriodSelector.vue record-card/RecordCard.vue section-header/Eyebrow.vue
    section-header/SectionHeader.vue section/Section.vue segmented/Segmented.vue
    stat-group/StatGroup.vue status-pill/StatusPill.vue tab/Tab.vue
    table-view/CascaderPath.vue table-view/KanbanBoard.vue table-view/KanbanDisplay.vue
    table-view/TableView.vue top-list/TopListCard.vue
  `
    .trim()
    .split(/\s+/),
  "dms-ui/app/components/form/components/": [
    "Calendar.vue",
    "Cascader.vue",
    "ChoiceCards.vue",
    "DatePicker.vue",
    "DatePickerRange.vue",
    "Display.vue",
    "File.vue",
    "Image.vue",
    "InputAddress.vue",
    "InputColor.vue",
    "InputNumber.vue",
    "InputPercentage.vue",
    "InputTags.vue",
    "KeyValue.vue",
    "Repeater.vue",
    "RepeaterTable.vue",
    "RichText.vue",
  ],
};
const compilerOptions = {
  module: ts.ModuleKind.CommonJS,
  target: ts.ScriptTarget.ES2022,
};
const dependencyLoaders = {
  "node:path": () => req("node:path"),
  vite: () => req("vite"),
};

function evaluate(source, filename, globals = {}, imports = {}, transformers) {
  const module = { exports: {} };
  const localRequire = (specifier) => {
    if (specifier in imports) return imports[specifier];
    if (specifier.startsWith(".")) {
      const target = path.resolve(path.dirname(filename), specifier);
      return load(target.endsWith(".ts") ? target : `${target}.ts`, globals);
    }
    const loader = dependencyLoaders[specifier];
    if (!loader) throw new Error(`Unexpected probe dependency ${specifier}`);
    return loader();
  };
  const code = ts.transpileModule(source, {
    compilerOptions,
    fileName: filename,
    transformers,
  }).outputText;
  vm.runInNewContext(
    code,
    {
      module,
      exports: module.exports,
      require: localRequire,
      Headers,
      TextEncoder,
      TextDecoder,
      btoa,
      atob,
      ...globals,
    },
    { filename },
  );
  return module.exports;
}

function load(filename, globals) {
  return evaluate(fs.readFileSync(filename, "utf8"), filename, globals);
}

async function authRetry(raw) {
  const reads = [];
  const calls = [];
  let refreshes = 0;
  const baseFetch = async (_request, options) => {
    calls.push(
      calls.length
        ? {
            token: options.headers.get("authorization"),
            retry: options.headers.get("x-auth-retry"),
          }
        : { unauthorized: true },
    );
    if (calls.length === 1) throw { response: { status: 401 } };
    return calls.at(-1);
  };
  baseFetch.raw = baseFetch;
  const filename = path.join(
    layers,
    "dms-core/app/composables/auth/useAuthFetch.ts",
  );
  const { useAuthFetch } = load(filename, {
    HTTP_UNAUTHORIZED: 401,
    useDmsUserSession: () => ({ loggedIn: { value: true } }),
    useSessionRecovery: () => ({
      refreshSession: async () => {
        refreshes++;
        return true;
      },
      reconcileSession: async () => {},
      redirectToAuth: async () => {},
    }),
    useDmsRuntimeConfig: () => ({ public: { dms: { baseURL: "/api" } } }),
    useDmsApp: () => ({ $i18n: { locale: { value: "en" } } }),
    useDmsState: (_key, initial) => ({ value: initial() }),
    $fetch: { create: () => baseFetch },
  });
  const options = Object.defineProperty({}, "headers", {
    enumerable: true,
    get() {
      reads.push(reads.length + 1);
      return { authorization: `token${reads.length}` };
    },
  });
  const { $authFetch } = useAuthFetch();
  const result = await (raw ? $authFetch.raw : $authFetch)(
    "/resource",
    options,
  );
  return { result, reads, refreshes, calls };
}

function preferences() {
  const filename = path.join(
    layers,
    "dms-core/app/build/composables/user/preferencesCookie.ts",
  );
  const { writeAt, readAt } = load(filename);
  const events = [];
  const first = {};
  const second = {};
  let reads = 0;
  const tree = Object.defineProperty({}, "branch", {
    enumerable: true,
    get() {
      events.push(`get:${++reads}`);
      return reads === 1 ? first : second;
    },
  });
  writeAt(tree, ["branch", "leaf"], "written");
  const plain = {};
  writeAt(plain, ["a", "b"], 7);
  const creationEvents = [];
  const afterAssignment = {};
  let assigned;
  let creationReads = 0;
  const creatingTree = Object.defineProperty({}, "branch", {
    get() {
      creationEvents.push(`get:${++creationReads}`);
      return creationReads === 1 ? undefined : afterAssignment;
    },
    set(value) {
      creationEvents.push("set");
      assigned = value;
    },
  });
  writeAt(creatingTree, ["branch", "leaf"], "created");
  return {
    events,
    first: first.leaf ?? null,
    second: second.leaf ?? null,
    plain: readAt(plain, ["a", "b"]),
    creation: {
      events: creationEvents,
      assigned: assigned.leaf ?? null,
      reread: afterAssignment.leaf ?? null,
    },
  };
}

function oauth() {
  const filename = path.join(
    layers,
    "dms-auth/app/custom-pages/auth/oauth-complete.vue",
  );
  const { descriptor } = sfc.parse(fs.readFileSync(filename, "utf8"), {
    filename,
  });
  const compiled = sfc.compileScript(descriptor, { id: "oauth-probe" });
  const { default: component } = evaluate(
    compiled.content,
    filename,
    {
      useDmsRoute: () => ({ query: {} }),
      useHomepage: () => "/home",
      useDmsApp: () => ({}),
      computed: (get) => ({
        get value() {
          return get();
        },
      }),
      onMounted: () => {},
    },
    { vue: { defineComponent: (options) => options } },
  );
  const exposed = component.setup({}, { expose() {} });
  const events = [];
  const actions = exposed.HANDOFF_ACTIONS;
  Object.defineProperty(actions, "none", {
    get() {
      events.push("action:get");
      return function (handoff) {
        events.push(
          this === actions ? "receiver:actions" : "receiver:undefined",
        );
        return handoff.token;
      };
    },
  });
  const handoff = {
    get kind() {
      events.push("kind:get");
      return "none";
    },
    token: "handoff-token",
  };
  const result = exposed.runHandoffAction(handoff);
  return { result, events };
}

function runtimeDeclaration(expression) {
  try {
    const javascript = ts.transpileModule(`module.exports = (${expression});`, {
      compilerOptions,
    }).outputText;
    const module = { exports: {} };
    const vue = req("vue");
    vm.runInNewContext(javascript, {
      module,
      _mergeDefaults: vue.mergeDefaults,
      _mergeModels: vue.mergeModels,
    });
    const serialize = (value) => {
      if (value === undefined) return { undefined: true };
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- VM evaluation returns runtime props values, not compiler AST nodes; compiler-derived types cannot distinguish function defaults for this JSON observation.
      if (typeof value === "function")
        return {
          function: value.name || null,
          code: value.toString().replace(/\s+/g, " "),
        };
      if (Array.isArray(value)) return Array.from(value, serialize);
      // oxlint-disable-next-line anti-slop/no-runtime-typeof -- The compiler's expression text has no type for its VM-evaluated objects; this observation must recurse without coercing primitives or functions.
      if (value && typeof value === "object")
        return Object.fromEntries(
          Object.entries(value).map(([key, entry]) => [key, serialize(entry)]),
        );
      return value;
    };
    return { status: "evaluated", value: serialize(module.exports) };
  } catch (error) {
    return { status: "runtime-unresolved", reason: error.message };
  }
}

function contracts() {
  const manifest = Object.entries(componentManifest).flatMap(
    ([prefix, files]) => files.map((file) => `${prefix}${file}`),
  );
  const printer = ts.createPrinter({ removeComments: true });
  const normalize = (source) =>
    printer
      .printFile(
        ts.createSourceFile(
          "contract.ts",
          source,
          ts.ScriptTarget.Latest,
          true,
        ),
      )
      .trim();
  return manifest.map((relative) => {
    const filename = path.join(layers, relative);
    const { descriptor } = sfc.parse(fs.readFileSync(filename, "utf8"), {
      filename,
    });
    try {
      const compiled = sfc.compileScript(descriptor, {
        id: "contract",
        fs: {
          fileExists: (file) =>
            fs.existsSync(file) && fs.statSync(file).isFile(),
          readFile: (file) => fs.readFileSync(file, "utf8"),
        },
      });
      const ast = ts.createSourceFile(
        "compiled.ts",
        compiled.content,
        ts.ScriptTarget.Latest,
        true,
      );
      const result = {
        path: relative,
        status: "compiled",
        props: null,
        emits: null,
        macros: [],
      };
      const inspect = (node) => {
        if (
          ts.isPropertyAssignment(node) &&
          ["props", "emits"].includes(node.name.getText(ast))
        ) {
          const expression = node.initializer.getText(ast);
          result[node.name.getText(ast)] = {
            compiled: normalize(expression),
            runtime: runtimeDeclaration(expression),
          };
        }
        ts.forEachChild(node, inspect);
      };
      inspect(ast);
      const raw = ts.createSourceFile(
        "source.ts",
        descriptor.scriptSetup?.content ?? "",
        ts.ScriptTarget.Latest,
        true,
      );
      const macro = (node) => {
        if (
          ts.isCallExpression(node) &&
          ["defineExpose", "defineSlots", "defineOptions"].includes(
            node.expression.getText(raw),
          )
        ) {
          result.macros.push(normalize(node.getText(raw)));
        }
        ts.forEachChild(node, macro);
      };
      macro(raw);
      return result;
    } catch (error) {
      return {
        path: relative,
        status: "compiler-unresolved",
        reason: error.message
          .split("\n")
          .find((line) => line.trim())
          .replaceAll(root, "<checkout>"),
      };
    }
  });
}

module.exports = {
  frontend,
  layers,
  req,
  ts,
  evaluate,
  load,
  observe: async () => ({
    authRetry: await authRetry(false),
    authRawRetry: await authRetry(true),
    preferences: preferences(),
    oauth: oauth(),
    componentContracts: contracts(),
  }),
};
