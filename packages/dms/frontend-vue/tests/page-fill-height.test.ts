/** @vitest-environment jsdom */
import {
  createApp,
  createSSRApp,
  h,
  nextTick,
  ref,
  Suspense,
  type App,
  type Component,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import DefaultLayout from "../layers/dms-layout/app/custom-layouts/DefaultLayout.vue";
import CatchAllPage from "../layers/dms-layout/app/pages/[...slug].vue";
import RecursiveComponent from "../layers/dms-ui/app/components/RecursiveComponent.vue";
import { usePageFillHeight } from "../layers/dms-layout/app/composables/layout/usePageFillHeight";
import { engine } from "./helpers/api-data-runtime";
import {
  installShellRuntime,
  registerShellUi,
} from "./helpers/live-shell-runtime";

const FillHeightProbe: FunctionalComponent = () =>
  h("output", String(usePageFillHeight().value));
const PageComponent: FunctionalComponent<{ componentId: string }> = (props) =>
  h("section", { "data-component": props.componentId }, props.componentId);
PageComponent.props = ["componentId"];
let app: App | undefined;
let disposeRuntime: () => void;

function withUi(target: App): App {
  registerShellUi(target);
  target.component("UDashboardGroup", (_, { attrs, slots }) =>
    h("div", attrs, slots.default?.()),
  );
  target.component("UDashboardPanel", (_, { slots }) =>
    h("main", [slots.header?.(), slots.body?.(), slots.footer?.()]),
  );
  target.component("UContainer", (_, { attrs, slots }) =>
    h("div", attrs, slots.default?.()),
  );
  target.component("DmsRecursiveComponent", RecursiveComponent);
  return target;
}

function root(fillHeight: boolean, page: Component) {
  return h(
    DefaultLayout,
    { title: "Explorer", fillHeight },
    { default: () => h(page) },
  );
}

beforeEach(async () => {
  disposeRuntime = await installShellRuntime("/tools/explorer");
  engine.registerDmsComponent("ToolStats", PageComponent);
  engine.registerDmsComponent("ToolExplorer", PageComponent);
  engine.useDmsState("dms-siteLayout").value = {
    pages: {
      "/tools/explorer": {
        fullId: "tools.explorer",
        hasAccess: true,
        layoutUrl: "/tools/explorer",
      },
    },
    categories: {},
  };
  engine.useDmsState("dms-pageLayouts").value = {
    "/tools/explorer": {
      layout: { options: {} },
      components: {
        stats: { componentName: "ToolStats" },
        explorer: { componentName: "ToolExplorer" },
      },
    },
  };
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  disposeRuntime();
  vi.unstubAllGlobals();
});

describe("usePageFillHeight", () => {
  it("reads false under a layout that does not provide it", async () => {
    expect(await renderToString(createSSRApp(FillHeightProbe))).toBe(
      "<output>false</output>",
    );
  });

  it("follows the layout that provides it", async () => {
    const fillHeight = ref(true);
    app = withUi(createApp(() => root(fillHeight.value, FillHeightProbe)));
    const host = document.createElement("div");
    app.mount(host);
    expect(host.querySelector("output")?.textContent).toBe("true");
    fillHeight.value = false;
    await nextTick();
    expect(host.querySelector("output")?.textContent).toBe("false");
  });
});

describe("DefaultLayout without fillHeight", () => {
  it("tells the page it does not fill the panel", async () => {
    const markup = await renderToString(
      withUi(createSSRApp(() => root(false, FillHeightProbe))),
    );
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector("output")?.textContent).toBe("false");
  });
});

describe("DefaultLayout with fillHeight", () => {
  it("tells a custom page, rendered straight in the slot, to fill", async () => {
    const markup = await renderToString(
      withUi(createSSRApp(() => root(true, FillHeightProbe))),
    );
    const host = document.createElement("div");
    host.innerHTML = markup;
    expect(host.querySelector("output")?.textContent).toBe("true");
  });

  it("renders the configured blocks in order on a filling page", async () => {
    app = withUi(
      createApp(() =>
        h(
          DefaultLayout,
          { title: "Explorer", fillHeight: true },
          {
            default: () =>
              h(Suspense, null, { default: () => h(CatchAllPage) }),
          },
        ),
      ),
    );
    const host = document.createElement("div");
    app.mount(host);
    await vi.waitFor(() =>
      expect(
        [...host.querySelectorAll("[data-component]")].map(
          (block) => block.textContent,
        ),
      ).toEqual(["stats", "explorer"]),
    );
  });
});

describe("DefaultLayout while the page loads", () => {
  it("shows the skeleton in place of the page while the engine waits on it", async () => {
    const Page = () => h("section", { "data-page": "" }, "Ready");
    app = withUi(createApp(() => root(false, Page)));
    const host = document.createElement("div");
    app.mount(host);
    const skeleton = () => host.querySelector(".dms-page-skeleton");
    const page = () => host.querySelector("[data-page]")?.parentElement;
    expect(skeleton()?.classList.contains("hidden")).toBe(true);
    const suspense = engine.dmsPageSuspenseProps();
    suspense.onPending!();
    await nextTick();
    expect(skeleton()?.classList.contains("hidden")).toBe(false);
    expect(page()?.classList.contains("hidden")).toBe(true);
    suspense.onResolve!();
    await nextTick();
    expect(skeleton()?.classList.contains("hidden")).toBe(true);
    expect(page()?.classList.contains("hidden")).toBe(false);
  });
});
