/** @vitest-environment jsdom */
/**
 * The page header's buttons while the browser hydrates the server's page:
 * the browser keeps the server's buttons untouched until the page in the
 * slot has set its actions, then shows its own buttons, attributes included.
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
  type Component,
  type FunctionalComponent,
} from "vue";
import { renderToString } from "vue/server-renderer";
import {
  holdPageHeaderActions,
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

/** What one side, the server or the browser, draws of the page. */
interface PageState {
  /** Whether the page's own header action is disabled. */
  disabled: boolean;
  /** How long the page's content holds the header actions back, if at all. */
  holdMs?: number;
}

const createPage = ({ disabled, holdMs }: PageState) =>
  defineComponent({
    setup() {
      const ContentRendered = holdPageHeaderActions();
      const contentShown = ref(holdMs === undefined);
      if (holdMs !== undefined) {
        setTimeout(() => {
          contentShown.value = true;
        }, holdMs);
      }
      usePageHeaderActions(() =>
        h(
          "button",
          { "data-page-action": "", disabled, onClick: pageActionClicks },
          "Page action",
        ),
      );
      return () =>
        h("p", ["Page body", contentShown.value ? h(ContentRendered) : null]);
    },
  });

/** A layout like the dashboard's: the header's outlet, then the page. */
const createLayout = (Page: Component) =>
  defineComponent({
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
          h("section", [h(Page)]),
          h(PageRendered),
        ]);
    },
  });

let app: App | undefined;

function createLayoutApp(page: PageState) {
  const app = createSSRApp(createLayout(createPage(page)));
  app.component("UButton", ButtonStub);
  app.component("UTooltip", SlotStub);
  return app;
}

/** The elements and text of `element`, without the markers Vue adds to the server's HTML. */
function visibleMarkup(element: Element): string {
  const copy = element.cloneNode(true);
  const walker = document.createTreeWalker(copy, NodeFilter.SHOW_COMMENT);
  const comments: Node[] = [];
  while (walker.nextNode()) comments.push(walker.currentNode);
  for (const comment of comments) comment.parentNode?.removeChild(comment);
  return copy instanceof Element ? copy.innerHTML : "";
}

function wait(ms = 0): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Draws the page on the server as `server` describes it, then hydrates it in
 * the browser as `client` describes it, watching the header from before the
 * browser touches it.
 */
async function hydrateLayout(server: PageState, client: PageState) {
  vi.stubGlobal("isDmsHydrating", () => false);
  const serverHtml = await renderToString(createLayoutApp(server));
  vi.stubGlobal("isDmsHydrating", () => true);
  const container = document.createElement("div");
  container.innerHTML = serverHtml;
  document.body.append(container);
  const header = container.querySelector("header");
  if (!header) throw new Error("The server drew no header");
  const serverHeader = header.innerHTML;
  const serverMarkup = visibleMarkup(header);
  const serverButtons = [...header.querySelectorAll("button")];
  const headerChanges: MutationRecord[] = [];
  new MutationObserver((records) => headerChanges.push(...records)).observe(
    header,
    { attributes: true, characterData: true, childList: true, subtree: true },
  );
  const warnings: string[] = [];
  const consoleWarn = vi
    .spyOn(console, "warn")
    .mockImplementation(() => undefined);
  const consoleError = vi
    .spyOn(console, "error")
    .mockImplementation(() => undefined);
  app = createLayoutApp(client);
  app.config.warnHandler = (message) => warnings.push(message);

  app.mount(container);
  await wait();
  await nextTick();

  return {
    header,
    serverHeader,
    serverMarkup,
    serverButtons,
    headerChanges,
    pageAction: () =>
      header.querySelector<HTMLButtonElement>("[data-page-action]"),
    warnings: () => [
      ...warnings,
      ...[...consoleWarn.mock.calls, ...consoleError.mock.calls].map(String),
    ],
  };
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
  it("shows the server's buttons unchanged and working once the page has set its actions", async () => {
    const page = { disabled: false };
    const hydrated = await hydrateLayout(page, page);
    hydrated.pageAction()?.click();

    expect(hydrated.serverButtons.map((button) => button.textContent)).toEqual([
      "Download",
      "Page action",
    ]);
    expect(hydrated.warnings()).toEqual([]);
    expect(visibleMarkup(hydrated.header)).toBe(hydrated.serverMarkup);
    expect(pageActionClicks).toHaveBeenCalledTimes(1);
  });

  it("shows the browser's actions, not the server's, once the page has set them", async () => {
    const hydrated = await hydrateLayout(
      { disabled: false },
      { disabled: true },
    );
    hydrated.pageAction()?.click();

    expect(
      hydrated.serverButtons.find((button) =>
        button.hasAttribute("data-page-action"),
      )?.disabled,
    ).toBe(false);
    expect(hydrated.pageAction()?.disabled).toBe(true);
    expect(pageActionClicks).not.toHaveBeenCalled();
  });

  it("keeps the server's buttons untouched until a page that holds its actions back sets them", async () => {
    const holdMs = 30;
    const hydrated = await hydrateLayout(
      { disabled: false },
      { disabled: true, holdMs },
    );
    const changesWhileHeld = [...hydrated.headerChanges];
    const headerWhileHeld = hydrated.header.innerHTML;

    await wait(holdMs * 2);
    await nextTick();
    hydrated.pageAction()?.click();

    expect(changesWhileHeld).toEqual([]);
    expect(headerWhileHeld).toBe(hydrated.serverHeader);
    expect(hydrated.pageAction()?.disabled).toBe(true);
    expect(pageActionClicks).not.toHaveBeenCalled();
  });
});
