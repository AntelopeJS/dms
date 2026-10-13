// @vitest-environment jsdom
/**
 * A page header's buttons follow the page URL: a target URL takes the
 * `{{params.X}}` / `{{query.X}}` tokens of a block's `fetchUrl`, and a
 * button whose availability reads the query is asked for again when the
 * query changes. The served buttons and a page's own actions
 * (`usePageHeaderActions`) share one order.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type FunctionalComponent,
} from "vue";
import { resolveLinkVariables } from "../layers/dms-ui/app/build/utils/urlVariables";
import {
  isSamePageQuery,
  layoutUrlWithQuery,
  pageQueryValues,
} from "../layers/dms-layout/app/utils/pageQuery";
import {
  providePageHeaderActions,
  usePageHeaderActions,
  type PageHeaderActionsOptions,
} from "../layers/dms-layout/app/composables/layout/usePageHeaderActions";

const handleCustomButton = vi.fn();
vi.mock("#dms-ui/app/build/composables/actions/useActionTargets", () => ({
  useActionTargets: () => ({ handleCustomButton }),
}));
vi.mock("#dms-core/app/build/composables/auth/usePermissionPreview", () => ({
  usePermissionPreview: () => ({
    isHeaderActionHidden: () => false,
    session: ref(null),
  }),
}));

const LAYOUT_URL = "/modules/lang/queue/pagelayout";
const route = reactive<{ path: string; query: Record<string, unknown> }>({
  path: "/modules/lang/queue/de",
  query: {},
});
const authFetch = vi.fn();

const ButtonStub = defineComponent({
  props: { label: String, disabled: Boolean, onClick: Function, to: String },
  setup: (props) => () =>
    h(
      "button",
      {
        disabled: props.disabled,
        "data-to": props.to,
        onClick: () => props.onClick?.(),
      },
      props.label,
    ),
});
const SlotStub: FunctionalComponent = (_, { slots }) => slots.default?.();

let app: App | undefined;
let host: HTMLDivElement;

beforeEach(() => {
  route.query = { workspace: "web" };
  handleCustomButton.mockClear();
  authFetch.mockReset();
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string, params?: Record<string, unknown>) =>
      value.replace(/\{(\w+)\}/g, (_, name: string) =>
        String(params?.[name] ?? `{${name}}`),
      ),
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsRouter", () => ({ replace: vi.fn() }));
  vi.stubGlobal("useSiteLayout", () => ({
    quickActions: ref(null),
    findMatchingRoute: () => ({
      metadata: { layoutUrl: LAYOUT_URL },
      params: { locale: "de" },
    }),
  }));
  host = document.createElement("div");
  document.body.append(host);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  host.remove();
  vi.unstubAllGlobals();
});

async function mount(path: string, props: Record<string, unknown>) {
  const { default: component } = await import(path);
  app = createApp({ render: () => h(component, props) });
  app.component("UButton", ButtonStub);
  app.component("UTooltip", SlotStub);
  app.mount(host);
  await nextTick();
}

const mountBar = (actions: unknown[]) =>
  mount(
    "../layers/dms-layout/app/build/components/layout/PageHeaderActionBar.vue",
    { actions },
  );

const buttons = () => [...host.querySelectorAll("button")];
const labels = () => buttons().map((button) => button.textContent);

describe("resolveLinkVariables", () => {
  const context = {
    routeParams: { id: "ws 1" },
    routeQuery: { workspace: "web", tab: "a&b" },
  };

  it("fills the page's params and query, encoded", () => {
    expect(
      resolveLinkVariables(
        "/ws/{{params.id}}?workspace={{query.workspace}}&tab={{query.tab}}",
        context,
      ),
    ).toBe("/ws/ws%201?workspace=web&tab=a%26b");
  });

  it("leaves out a query pair the page has no value for", () => {
    expect(
      resolveLinkVariables(
        "/t?missing={{query.locale}}&workspace={{query.workspace}}#keys",
        context,
      ),
    ).toBe("/t?workspace=web#keys");
    expect(resolveLinkVariables("/t?locale={{query.locale}}", context)).toBe(
      "/t",
    );
  });

  it("fills a query key carrying dots", () => {
    expect(
      resolveLinkVariables("/logs?period={{query.api.period}}", {
        routeQuery: { "api.period": "7d" },
      }),
    ).toBe("/logs?period=7d");
  });

  it("empties any other token left without a value", () => {
    expect(resolveLinkVariables("/t/{{params.slug}}/edit", context)).toBe(
      "/t//edit",
    );
  });
});

describe("page query helpers", () => {
  it("reads one value per name, the last, as the server does", () => {
    expect(
      pageQueryValues({ workspace: "web", tag: ["a", "b"], empty: null }),
    ).toEqual({ workspace: "web", tag: "b" });
  });

  it("compares queries in any order", () => {
    expect(isSamePageQuery({ a: "1", b: "2" }, { b: "2", a: "1" })).toBe(true);
    expect(isSamePageQuery({ a: "1" }, { a: "1", b: "2" })).toBe(false);
  });

  it("leaves out the keys that only record the view's state", () => {
    const base = { workspace: "shop" };
    expect(
      isSamePageQuery(base, {
        workspace: "shop",
        record: "42",
        live: "0",
        "api.period": "24h",
        "api.compare": "previous",
        "api.from": "2026-10-01",
      }),
    ).toBe(true);
    expect(isSamePageQuery(base, { workspace: "blog", record: "42" })).toBe(
      false,
    );
  });

  it("asks the layout URL for a query", () => {
    expect(layoutUrlWithQuery("/p/pagelayout", { workspace: "a b" })).toBe(
      "/p/pagelayout?workspace=a+b",
    );
    expect(layoutUrlWithQuery("/p/pagelayout", {})).toBe("/p/pagelayout");
  });
});

describe("a header button's target URL", () => {
  it("links to the page's scope, and follows it", async () => {
    await mountBar([
      {
        id: "matrix",
        label: "Open matrix",
        target: {
          type: "page",
          url: "/modules/lang/translations?workspace={{query.workspace}}&missingIn={{params.locale}}",
        },
      },
    ]);
    expect(buttons()[0]?.dataset.to).toBe(
      "/modules/lang/translations?workspace=web&missingIn=de",
    );

    route.query = { workspace: "docs" };
    await nextTick();
    expect(buttons()[0]?.dataset.to).toBe(
      "/modules/lang/translations?workspace=docs&missingIn=de",
    );

    route.query = {};
    await nextTick();
    expect(buttons()[0]?.dataset.to).toBe(
      "/modules/lang/translations?missingIn=de",
    );
  });

  it("runs an API target on the page's record", async () => {
    await mountBar([
      {
        id: "export",
        label: "Export",
        target: {
          type: "api",
          url: "/api/lang/export?workspace={{query.workspace}}",
          successMessage: "Done",
        },
        confirm: { title: "Export?" },
      },
    ]);
    buttons()[0]?.click();
    expect(handleCustomButton).toHaveBeenCalledWith(
      expect.objectContaining({
        target: expect.objectContaining({
          url: "/api/lang/export?workspace=web",
        }),
      }),
    );
  });
  it("runs a download target on the page's scope, as a button", async () => {
    await mountBar([
      {
        id: "download-language",
        label: "Download",
        target: {
          type: "download",
          url: "/api/lang/translations/export?workspace={{query.workspace}}&locale={{params.locale}}",
          filename: "{{params.locale}}.json",
        },
      },
    ]);
    expect(buttons()[0]?.dataset.to).toBeUndefined();
    buttons()[0]?.click();
    expect(handleCustomButton).toHaveBeenCalledWith(
      expect.objectContaining({
        target: {
          type: "download",
          url: "/api/lang/translations/export?workspace=web&locale=de",
          filename: "{{params.locale}}.json",
        },
      }),
    );
  });
});

describe("a header button's label", () => {
  it("reads the page's query and params as its parameters, and follows them", async () => {
    route.query = { workspace: "web", file: "fr" };
    await mountBar([
      {
        id: "download",
        label: "Download {file}.json for {locale}",
        target: { type: "page", url: "/x" },
      },
    ]);
    expect(labels()).toEqual(["Download fr.json for de"]);

    route.query = { workspace: "web", file: "it" };
    await nextTick();
    expect(labels()).toEqual(["Download it.json for de"]);
  });
});

describe("a header button's availability", () => {
  const download = (disabled: boolean) => ({
    id: "download",
    label: "Download",
    target: { type: "page", url: "/download" },
    disabled,
  });

  const mountOutlet = (servedQuery?: Record<string, string>) =>
    mount(
      "../layers/dms-layout/app/build/components/layout/PageHeaderActionsOutlet.vue",
      { actions: [download(false)], servedQuery },
    );

  it("is not asked again while the query is the one it was served for", async () => {
    await mountOutlet({ workspace: "web" });
    expect(authFetch).not.toHaveBeenCalled();
    expect(buttons()[0]?.disabled).toBe(false);
  });

  it("is asked again for the page's query when it changes", async () => {
    authFetch.mockResolvedValue({
      components: {},
      layout: { options: { headerActions: [download(true)] } },
    });
    await mountOutlet({ workspace: "web" });

    route.query = { workspace: "gone" };
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(authFetch).toHaveBeenCalledWith(`${LAYOUT_URL}?workspace=gone`);
    expect(buttons()[0]?.disabled).toBe(true);

    route.query = { workspace: "web" };
    await nextTick();
    expect(buttons()[0]?.disabled).toBe(false);
  });

  it("shows a button it hides only for the queries it does not hide it for", async () => {
    const addKey = {
      id: "add-key",
      label: "Add key",
      target: download(false).target,
    };
    authFetch.mockResolvedValue({
      components: {},
      layout: { options: { headerActions: [download(false)] } },
    });
    await mount(
      "../layers/dms-layout/app/build/components/layout/PageHeaderActionsOutlet.vue",
      { actions: [download(false), addKey], servedQuery: { workspace: "web" } },
    );
    expect(labels()).toEqual(["Download", "Add key"]);

    route.query = { workspace: "modules" };
    await nextTick();
    await new Promise((resolve) => setTimeout(resolve));
    expect(authFetch).toHaveBeenCalledWith(`${LAYOUT_URL}?workspace=modules`);
    expect(labels()).toEqual(["Download"]);

    route.query = { workspace: "web" };
    await nextTick();
    expect(labels()).toEqual(["Download", "Add key"]);
  });

  it("is never asked again when no button declares one", async () => {
    await mountOutlet(undefined);
    route.query = { workspace: "gone" };
    await nextTick();
    expect(authFetch).not.toHaveBeenCalled();
  });
});

describe("the order of the header's buttons", () => {
  const served = (id: string, order?: number) => ({
    id,
    label: id,
    target: { type: "page", url: `/${id}` },
    order,
  });

  // A layout's page body: the outlet, then the page calling
  // usePageHeaderActions, then the marker saying the page has rendered.
  async function mountPage(
    actions: unknown[],
    options?: PageHeaderActionsOptions,
  ) {
    const { default: Outlet } = await import(
      "../layers/dms-layout/app/build/components/layout/PageHeaderActionsOutlet.vue"
    );
    const Page = defineComponent({
      setup() {
        usePageHeaderActions(() => h("button", "Export"), options);
        return () => null;
      },
    });
    const Body = defineComponent({
      setup() {
        const pageHost = providePageHeaderActions();
        const Rendered = defineComponent({
          setup() {
            pageHost.markSlotRendered();
            return () => null;
          },
        });
        return () => [h(Outlet, { actions }), h(Page), h(Rendered)];
      },
    });
    app = createApp(Body);
    app.component("UButton", ButtonStub);
    app.component("UTooltip", SlotStub);
    app.mount(host);
    await nextTick();
  }

  it("puts the page's actions after the served buttons by default", async () => {
    await mountPage([served("add-key"), served("add-language")]);
    expect(labels()).toEqual(["add-key", "add-language", "Export"]);
  });

  it("puts them before the served buttons of a greater order", async () => {
    await mountPage([served("add-key")], { order: -1 });
    expect(labels()).toEqual(["Export", "add-key"]);
  });

  it("sorts the served buttons by order, the declared order breaking ties", async () => {
    await mountPage(
      [served("last", 2), served("first"), served("second"), served("mid", 1)],
      { order: 1 },
    );
    expect(labels()).toEqual(["first", "second", "mid", "Export", "last"]);
  });
});
