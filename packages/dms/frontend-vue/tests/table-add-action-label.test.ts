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
  type Component,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableActions from "../layers/dms-ui/app/build/components/table/Actions.vue";
import TableEmpty from "../layers/dms-ui/app/build/components/table/Empty.vue";
import type { TableAddActionTexts } from "../layers/dms-ui/app/build/components/table/Table.vue";
import { FULL_TABLE_CHROME } from "../layers/dms-ui/app/build/composables/table-view/utils/chrome";

// The add button reads as `rowActions.add` words it, in the toolbar (and its
// phone twin) and in the empty state alike; "New entry" otherwise.

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

const ButtonStub = defineComponent({
  props: { label: String, icon: String, onClick: Function },
  setup:
    (props, { attrs }) =>
    () =>
      h(
        "button",
        {
          "aria-label": attrs["aria-label"],
          "data-icon": props.icon,
          onClick: props.onClick,
        },
        props.label,
      ),
});

let app: App | undefined;

const sharedData = (addAction?: TableAddActionTexts) =>
  shallowRef({
    activeCapabilities: ref({ search: false, filters: false, sorting: false }),
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
    addAction,
  });

function mount(component: Component, addAction?: TableAddActionTexts) {
  const Host = defineComponent({
    setup() {
      provide("tableSharedData", sharedData(addAction));
      return () =>
        h(component, {
          canAddRow: true,
          chrome: { ...FULL_TABLE_CHROME, refresh: false, menu: false },
        });
    },
  });
  app = createApp(Host);
  for (const [name, stub] of Object.entries({
    UButton: ButtonStub,
    UTooltip: PassThrough,
    UPopover: PassThrough,
    UDropdownMenu: PassThrough,
    UIcon: PassThrough,
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  return container;
}

const buttons = (container: HTMLElement) => [
  ...container.querySelectorAll("button"),
];

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
  document.body.replaceChildren();
  vi.unstubAllGlobals();
});

describe("the add button of a table", () => {
  it("reads as the label and icon rowActions.add gives it, in the toolbar", () => {
    const container = mount(TableActions, {
      label: "$crm.invoice.new",
      icon: "i-ph-receipt",
    });
    const [button, phone] = buttons(container);
    expect(button!.textContent).toBe("translated:crm.invoice.new");
    expect(button!.dataset.icon).toBe("i-ph-receipt");
    expect(phone!.getAttribute("aria-label")).toBe(
      "translated:crm.invoice.new",
    );
    expect(phone!.dataset.icon).toBe("i-ph-receipt");
  });

  it("reads as New entry without one", () => {
    const [button] = buttons(mount(TableActions));
    expect(button!.textContent).toBe("dms.table.new_row");
    expect(button!.dataset.icon).toBe("plus");
  });

  it("reads as the configured label in the empty state", () => {
    const container = mount(TableEmpty, {
      label: "New invoice",
      icon: "i-ph-receipt",
    });
    const [button] = buttons(container);
    expect(button!.textContent).toBe("New invoice");
    expect(button!.dataset.icon).toBe("i-ph-receipt");
  });
});
