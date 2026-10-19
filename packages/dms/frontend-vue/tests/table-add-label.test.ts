// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  provide,
  ref,
  shallowRef,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableActions from "../layers/dms-ui/app/build/components/table/Actions.vue";
import TableEmpty from "../layers/dms-ui/app/build/components/table/Empty.vue";
import { FULL_TABLE_CHROME } from "../layers/dms-ui/app/build/composables/table-view/utils/chrome";

vi.mock("../layers/dms-ui/app/build/components/table/Menu.vue", () => ({
  default: { render: () => null },
}));

vi.mock("../layers/dms-ui/app/build/components/form/SearchInput.vue", () => ({
  default: { render: () => null },
}));

const PassThrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

// The label as the button's text, its other attributes (aria-label) kept.
const ButtonStub = defineComponent({
  props: { label: String },
  setup: (props) => () => h("button", props.label),
});

let app: App | undefined;

function mount(root: () => ReturnType<typeof h>, addLabel?: string) {
  const Host = defineComponent({
    setup() {
      provide(
        "tableSharedData",
        shallowRef({
          activeCapabilities: ref({
            search: false,
            filters: false,
            sorting: false,
          }),
          labeledColumns: ref([]),
          globalFilterState: ref(""),
          columnFiltersState: ref([]),
          paginationState: ref({ pageIndex: 0, pageSize: 10 }),
          filtersRowOpenState: ref(false),
          hasCustomSort: ref(false),
          displays: [],
          activeDisplayState: ref("table"),
          kanbanGroupByOptions: [],
          kanbanGroupByState: ref(undefined),
          onFiltersCleared: () => undefined,
          isFiltered: computed(() => false),
          clearableFilters: computed(() => undefined),
          showArchivedState: ref(false),
          emits: () => undefined,
          addLabel,
        }),
      );
      return root;
    },
  });
  app = createApp(Host);
  for (const [name, stub] of Object.entries({
    UButton: ButtonStub,
    UKbd: PassThrough,
    UPopover: PassThrough,
    UDropdownMenu: PassThrough,
    UTooltip: PassThrough,
    UIcon: PassThrough,
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  app.mount(container);
  return container;
}

const mountActions = (addLabel?: string) =>
  mount(
    () =>
      h(TableActions, {
        canAddRow: true,
        addLabel,
        chrome: { ...FULL_TABLE_CHROME, refresh: false, menu: false },
      }),
    addLabel,
  );

const buttonTexts = (container: HTMLElement) =>
  [...container.querySelectorAll("button")].map((button) => ({
    text: button.textContent,
    ariaLabel: button.getAttribute("aria-label"),
  }));

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("defineShortcuts", () => undefined);
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { close: "close", plus: "plus", ellipsis: "ellipsis" } },
  }));
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    te: () => false,
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (value: string) =>
      value.startsWith("$") ? `translated:${value.slice(1)}` : value,
  }));
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("the table's add button", () => {
  it("reads the configured label on the toolbar, desktop and mobile", () => {
    const container = mountActions("$page.projects.add");
    expect(buttonTexts(container)).toEqual([
      { text: "translated:page.projects.add", ariaLabel: null },
      { text: "", ariaLabel: "translated:page.projects.add" },
    ]);
  });

  it("falls back to the default label", () => {
    const container = mountActions();
    expect(buttonTexts(container)).toEqual([
      { text: "dms.table.new_row", ariaLabel: null },
      { text: "", ariaLabel: "dms.table.new_row" },
    ]);
  });

  it("reads the configured label in the empty state", () => {
    const configured = mount(
      () => h(TableEmpty, { canAddRow: true }),
      "New project",
    );
    expect(configured.querySelector("button")?.textContent).toBe("New project");
    app?.unmount();
    const fallback = mount(() => h(TableEmpty, { canAddRow: true }));
    expect(fallback.querySelector("button")?.textContent).toBe(
      "dms.table.new_row",
    );
  });
});
