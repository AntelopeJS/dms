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
