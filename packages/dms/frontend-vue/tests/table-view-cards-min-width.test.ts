// @vitest-environment jsdom
import { computed, createApp, h, reactive, ref, type App } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import CardsDisplay from "../layers/dms-ui/app/build/components/table-view/CardsDisplay.vue";
import {
  CARD_GRID_CLASS,
  cardGridStyle,
  DEFAULT_CARD_MIN_WIDTH,
} from "../layers/dms-ui/app/build/composables/table-view/utils/card";
import type {
  TableViewCardConfig,
  TableViewDisplayContext,
} from "../layers/dms-ui/app/composables/table-view/types/display";

vi.mock("../layers/dms-ui/app/build/components/table/Pagination.vue", () => ({
  default: { render: () => null },
}));
vi.mock("../layers/dms-ui/app/build/components/table/Empty.vue", () => ({
  default: { render: () => null },
}));

const SiteCard = {
  props: { rowId: String },
  setup: (props: { rowId?: string }) => () => h("article", props.rowId),
};

const MIN_WIDTH_PROPERTY = "--dms-card-min-width";

function createContext(card: TableViewCardConfig, firstPageLoading = false) {
  return reactive({
    items: firstPageLoading ? [] : [{ _id: "s0" }, { _id: "s1" }],
    columns: [],
    loading: firstPageLoading,
    firstPageLoading,
    rowIdKey: "_id",
    labelKey: "name",
    options: { card: { component: { componentName: "SiteCard" }, ...card } },
    pagination: { pageIndex: 0, pageSize: 3, total: 2 },
    selection: { isSelected: () => false, toggle: () => {} },
    actions: { canAdd: false, open: () => {} },
  }) as unknown as TableViewDisplayContext;
}

describe("the width of the cards display's cards", () => {
  let app: App | undefined;
  let container: HTMLElement;

  const mount = (context: TableViewDisplayContext) => {
    app = createApp({ render: () => h(CardsDisplay, { context }) });
    app.component("USkeleton", {
      render: () => h("span", { "data-test": "skeleton" }),
    });
    container = document.createElement("div");
    document.body.append(container);
    app.mount(container);
  };
  const grid = () => container.querySelector<HTMLElement>(".grid")!;

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("h", h);
    vi.stubGlobal("useI18n", () => ({
      locale: ref("en"),
      t: (t: string) => t,
    }));
    vi.stubGlobal("useTranslation", () => ({ processI18n: (t: string) => t }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("resolveDmsComponent", (name: string) =>
      name === "SiteCard" ? SiteCard : undefined,
    );
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    container.remove();
    vi.unstubAllGlobals();
  });

  it("lays the cards out on the table's card.minWidth", () => {
    mount(createContext({ minWidth: "320px" }));
    expect(grid().querySelectorAll("article")).toHaveLength(2);
    expect(grid().style.getPropertyValue(MIN_WIDTH_PROPERTY)).toBe("320px");
  });

  it("draws the skeleton's cards at the same width", () => {
    mount(createContext({ minWidth: "20rem" }, true));
    expect(grid().querySelector('[data-test="skeleton"]')).not.toBeNull();
    expect(grid().getAttribute("aria-hidden")).toBe("true");
    expect(grid().style.getPropertyValue(MIN_WIDTH_PROPERTY)).toBe("20rem");
  });

  it("keeps 230px for a table that sets no width", () => {
    mount(createContext({}));
    expect(grid().style.getPropertyValue(MIN_WIDTH_PROPERTY)).toBe(
      DEFAULT_CARD_MIN_WIDTH,
    );
    expect(DEFAULT_CARD_MIN_WIDTH).toBe("230px");
  });

  it("collapses the empty tracks of a short list, so its cards fill the row", () => {
    mount(createContext({}));
    expect(grid().className).toBe(CARD_GRID_CLASS);
    expect(CARD_GRID_CLASS).toContain(
      "grid-cols-[repeat(auto-fit,minmax(min(var(--dms-card-min-width),100%),1fr))]",
    );
  });
});

describe("cardGridStyle", () => {
  it("caps a grid of n cards at twice their minimum width, gaps and padding included", () => {
    expect(cardGridStyle("300px", 2)).toEqual({
      [MIN_WIDTH_PROPERTY]: "300px",
      maxWidth: "calc(2 * 2 * 300px + 1 * 0.75rem + 36px)",
    });
  });

  it("caps an empty grid like a grid of one card", () => {
    expect(cardGridStyle(undefined, 0).maxWidth).toBe(
      "calc(1 * 2 * 230px + 0 * 0.75rem + 36px)",
    );
  });
});
