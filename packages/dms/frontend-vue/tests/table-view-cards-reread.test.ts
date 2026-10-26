/** @vitest-environment jsdom */
import "./helpers/table-runtime";
import { computed, createApp, h, reactive, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import type { TableViewDisplayContext } from "../layers/dms-ui/app/composables/table-view/types/display";

interface ReadState {
  loading: boolean;
  firstPageLoading: boolean;
}

function createContext(state: ReadState) {
  return reactive({
    items: [],
    columns: [],
    ...state,
    rowIdKey: "_id",
    labelKey: "name",
    options: {},
    pagination: { pageIndex: 0, pageSize: 10, total: 0 },
    selection: { isSelected: () => false, toggle: () => {} },
    actions: { canAdd: false, open: () => {} },
  }) as unknown as TableViewDisplayContext;
}

describe("the cards display of an empty list", () => {
  let app: App | undefined;
  let container: HTMLElement;

  const mount = (context: TableViewDisplayContext) => {
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    container = document.createElement("div");
    document.body.append(container);
    app.mount(container);
  };
  const shown = (test: string) =>
    container.querySelector(
      test === "skeleton"
        ? ':scope > div > [aria-hidden="true"]'
        : '[role="status"]',
    ) !== null;

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("h", h);
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (t: string) => t,
    }));
    vi.stubGlobal("resolveDmsComponent", () => undefined);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    container.remove();
    vi.unstubAllGlobals();
  });

  it("draws the skeleton until the first answer arrives", () => {
    mount(createContext({ loading: true, firstPageLoading: true }));
    expect(shown("skeleton")).toBe(true);
    expect(shown("empty")).toBe(false);
  });

  it("keeps the empty state on screen while the list is read again", () => {
    mount(createContext({ loading: true, firstPageLoading: false }));
    expect(shown("empty")).toBe(true);
    expect(shown("skeleton")).toBe(false);
  });
});
