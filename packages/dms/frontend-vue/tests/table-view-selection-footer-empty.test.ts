// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  shallowRef,
  type App,
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableRowSelection from "../layers/dms-ui/app/build/components/table/RowSelection.vue";
import TableEmpty from "../layers/dms-ui/app/build/components/table/Empty.vue";
import TablePagination from "../layers/dms-ui/app/build/components/table/Pagination.vue";

vi.mock(
  "../layers/dms-ui/app/components/empty-state/EmptyState.vue",
  async () => {
    const vue = await import("vue");
    const Button = vue.defineComponent({
      props: { label: String, to: String },
      setup: (props) => () =>
        vue.h("button", { "data-to": props.to }, props.label),
    });
    return {
      default: vue.defineComponent({
        props: { title: String, description: String, actions: Array },
        setup: (props) => () =>
          vue.h("section", [
            vue.h("h3", props.title),
            vue.h("p", props.description),
            ...(props.actions ?? []).map((action) =>
              vue.h(Button, action as Record<string, unknown>),
            ),
          ]),
      }),
    };
  },
);

const ButtonStub = defineComponent({
  props: { label: String, ariaLabel: String, to: String },
  emits: ["click"],
  setup:
    (props, { emit }) =>
    () =>
      h(
        "button",
        {
          "aria-label": props.ariaLabel,
          "data-to": props.to,
          onClick: () => emit("click"),
        },
        props.label,
      ),
});

const I18nTStub = defineComponent({
  props: { keypath: String, plural: Number },
  setup:
    (props, { slots }) =>
    () =>
      h("span", { "data-keypath": props.keypath }, [
        slots.count?.(),
        " ",
        slots.total?.(),
      ]),
});

let app: App | undefined;

function mount(
  component: Component,
  props: Record<string, unknown>,
  shared: Record<string, unknown>,
) {
  const emitted: unknown[][] = [];
  const Host = defineComponent({
    setup() {
      // The table shares its state with its parts by injection.
      provide(
        "tableSharedData",
        shallowRef({
          emits: (...args: unknown[]) => emitted.push(args),
          ...shared,
        }),
      );
      return () => h(component, props);
    },
  });
  app = createApp(Host);
  for (const [name, stub] of Object.entries({
    UButton: ButtonStub,
    UCheckbox: defineComponent({ render: () => h("input") }),
    UIcon: defineComponent({ render: () => h("i") }),
    USkeleton: defineComponent({
      render: () => h("span", { "data-skeleton": "" }),
    }),
    USelect: defineComponent({ render: () => h("select") }),
    I18nT: I18nTStub,
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  app.mount(container);
  return { container, emitted };
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}:${JSON.stringify(params)}` : key,
    te: () => false,
    locale: ref("en-GB"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string, params?: Record<string, unknown>) =>
      text.startsWith("$")
        ? `${text.slice(1)}${params ? JSON.stringify(params) : ""}`
        : text,
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { close: "i-x", arrowLeft: "i-left" } },
  }));
  vi.stubGlobal("resolveDmsComponent", () => undefined);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("selection bar", () => {
  const rerun = {
    label: "Re-run",
    bulk: { allMatching: true as const },
    target: { type: "api" as const, url: "/rerun", successMessage: "ok" },
  };
  const tag = {
    label: "Tag",
    bulk: true as const,
    target: { type: "api" as const, url: "/tag", successMessage: "ok" },
  };
  const pageOf = (count: number) => ({
    table: {
      getRowModel: () => ({
        rows: Array.from({ length: count }, (_, index) => ({
          id: `r${index}`,
        })),
      }),
      getIsAllPageRowsSelected: () => true,
      toggleAllPageRowsSelected: vi.fn(),
    },
  });

  it("offers every matching row once the page is selected, then only the actions reaching them", async () => {
    const allMatching = ref(false);
    const { container, emitted } = mount(
      defineComponent({
        setup: () => () =>
          h(TableRowSelection, {
            rowSelection: { r0: true, r1: true },
            allMatching: allMatching.value,
            "onUpdate:allMatching": (value: boolean) => {
              allMatching.value = value;
            },
            rowActions: { delete: true },
            bulkActions: [rerun, tag],
            total: 40,
            canExport: true,
          }),
      }),
      {},
      pageOf(2),
    );
    const labels = () =>
      [...container.querySelectorAll("button")].map(
        (button) =>
          button.textContent?.trim() || button.getAttribute("aria-label"),
      );
    expect(labels()).toContain('dms.table.select_all_matching:{"count":"40"}');
    expect(labels()).toEqual(
      expect.arrayContaining(["Re-run", "Tag", "dms.button.delete"]),
    );

    const selectAll = [...container.querySelectorAll("button")].find((button) =>
      button.textContent?.includes("select_all_matching"),
    );
    selectAll!.click();
    await nextTick();
    expect(allMatching.value).toBe(true);
    expect(
      container.querySelector(
        '[data-keypath="dms.table.all_matching_selected"]',
      ),
    ).not.toBe(null);
    expect(labels()).toContain("Re-run");
    expect(labels()).not.toContain("Tag");
    expect(labels()).not.toContain("dms.button.delete");

    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "Re-run")!
      .click();
    [...container.querySelectorAll("button")]
      .find((button) => button.textContent === "dms.button.export_data")!
      .click();
    expect(emitted).toEqual([["bulkAction", rerun], ["exportAll"]]);
  });
});

describe("empty body", () => {
  it("words a filtered table in the module's terms, the clear action first", () => {
    const { container } = mount(
      TableEmpty,
      {
        emptyStates: {
          filtered: {
            title: "$runs.none_for",
            description: "Try another name.",
            actions: [{ label: "Docs", to: "https://docs.example" }],
          },
        },
      },
      {
        isFiltered: computed(() => true),
        clearableFilters: computed(() => ({ search: true, filters: false })),
        globalFilterState: ref("zzz"),
        resetFilters: vi.fn(),
      },
    );
    expect(container.querySelector("h3")?.textContent).toBe(
      'runs.none_for{"search":"zzz"}',
    );
    expect(container.querySelector("p")?.textContent).toBe("Try another name.");
    expect(
      [...container.querySelectorAll("button")].map((button) => [
        button.textContent,
        button.getAttribute("data-to"),
      ]),
    ).toEqual([
      ["dms.table.clear_search", null],
      ["Docs", "https://docs.example"],
    ]);
  });

  it("keeps the built-in words for a reason the module left out", () => {
    const { container } = mount(
      TableEmpty,
      { loadError: "error.500", emptyStates: { filtered: { title: "x" } } },
      {
        isFiltered: computed(() => false),
        clearableFilters: computed(() => ({})),
        globalFilterState: ref(""),
      },
    );
    expect(container.querySelector("h3")?.textContent).toBe(
      "dms.table.load_error_title",
    );
  });
});

describe("footer figures", () => {
  it("draws the summaries after the count and the legend's colored values", () => {
    const { container } = mount(
      TablePagination,
      {},
      {
        rowCount: 32,
        firstPageLoading: false,
        paginationState: ref({ pageIndex: 0, pageSize: 10 }),
        chrome: computed(() => ({ pageSize: true })),
        table: {
          getCanPreviousPage: () => false,
          getCanNextPage: () => true,
        },
        footer: {
          summaries: [
            { id: "0", label: "Output", value: "354 MB" },
            { id: "1", label: "Failing" },
          ],
          legend: [
            { label: "Healthy", color: "success" },
            { label: "Paused", color: "neutral" },
          ],
        },
      },
    );
    const text = container.textContent ?? "";
    expect(text).toContain("Output");
    expect(text).toContain("354 MB");
    expect(text).toContain("Failing");
    expect(container.querySelectorAll("[data-skeleton]")).toHaveLength(1);
    const dots = [...container.querySelectorAll("span.rounded-full")].map(
      (dot) => dot.className,
    );
    expect(dots.some((name) => name.includes("text-success"))).toBe(true);
    expect(dots.some((name) => name.includes("text-muted"))).toBe(true);
  });
});
