/** @vitest-environment jsdom */
/**
 * The page header's buttons hydrate as the server drew them: the browser
 * keeps the server's buttons until the page in the slot has set its actions,
 * then hydrates them in place, without a mismatch.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  computed,
  createSSRApp,
  defineComponent,
  h,
  nextTick,
  reactive,
  ref,
  type App,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import {
  providePageHeaderActions,
  usePageHeaderActions,
} from "../layers/dms-ui/app/composables/layout/usePageHeaderActions";
import { stubMiscActions } from "./helpers/misc-runtime";

const { default: PageHeaderActionsOutlet } = await import(
  "../layers/dms-layout/app/entries/components/layout/PageHeaderActionsOutlet"
);

const ButtonStub = defineComponent({
  props: { label: String, to: String },
  setup: (props) => () => h("button", { "data-to": props.to }, props.label),
});
const SlotStub: FunctionalComponent = (_, { slots }) => slots.default?.();
const pageActionClicks = vi.fn();

const PageWithAction = defineComponent({
  setup() {
    usePageHeaderActions(() =>
      h(
        "button",
        { "data-page-action": "", onClick: pageActionClicks },
        "Page action",
      ),
    );
    return () => h("p", "Page body");
  },
});

/** A layout like the dashboard's: the header's outlet, then the page. */
const Layout = defineComponent({
  setup() {
    const host = providePageHeaderActions();
    const PageRendered = defineComponent({
      setup() {
        host.markSlotRendered();
        return () => null;
      },
    });
    return () =>
      h("main", [
        h("header", [
          h(PageHeaderActionsOutlet, {
            actions: [
              {
                id: "download",
                label: "Download",
                target: { type: "page", url: "/download" },
              },
            ],
          }),
        ]),
        h("section", [h(PageWithAction)]),
        h(PageRendered),
      ]);
  },
});

let app: App | undefined;

function createLayoutApp() {
  const app = createSSRApp(Layout);
  app.component("UButton", ButtonStub);
  app.component("UTooltip", SlotStub);
  return app;
}

function settle(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  stubMiscActions();
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (value: string) => value,
    processI18n: (value: string) => value,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => reactive({ path: "/page", query: {} }));
  vi.stubGlobal("useDmsRouter", () => ({ replace: vi.fn() }));
  vi.stubGlobal("useSiteLayout", () => ({
    quickActions: ref(null),
    findMatchingRoute: () => null,
  }));
  pageActionClicks.mockClear();
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  document.body.innerHTML = "";
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("page header actions hydration", () => {
  it("hydrates the server's buttons in place once the page has set its actions", async () => {
    vi.stubGlobal("isDmsHydrating", () => false);
    const serverHtml = await renderToString(createLayoutApp());
    vi.stubGlobal("isDmsHydrating", () => true);
    const container = document.createElement("div");
    container.innerHTML = serverHtml;
    document.body.append(container);
    const serverHeader = container.querySelector("header")?.innerHTML;
    const serverButtons = [...container.querySelectorAll("header button")];
    const warnings: string[] = [];
    const consoleWarn = vi
      .spyOn(console, "warn")
      .mockImplementation(() => undefined);
    const consoleError = vi
      .spyOn(console, "error")
      .mockImplementation(() => undefined);
    app = createLayoutApp();
    app.config.warnHandler = (message) => warnings.push(message);

    app.mount(container);
    await settle();
    await nextTick();
    container.querySelector<HTMLButtonElement>("[data-page-action]")?.click();
    warnings.push(
      ...[...consoleWarn.mock.calls, ...consoleError.mock.calls].map(String),
    );
    const hydratedButtons = [...container.querySelectorAll("header button")];

    expect(serverButtons.map((button) => button.textContent)).toEqual([
      "Download",
      "Page action",
    ]);
    expect(warnings).toEqual([]);
    expect(container.querySelector("header")?.innerHTML).toBe(serverHeader);
    expect(
      hydratedButtons.length === serverButtons.length &&
        hydratedButtons.every(
          (button, index) => button === serverButtons[index],
        ),
    ).toBe(true);
    expect(pageActionClicks).toHaveBeenCalledTimes(1);
  });
});
