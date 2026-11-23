/**
 * @packageDocumentation
 * @vitest-environment jsdom
 */
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  provide,
  ref,
  shallowRef,
  watch,
  type App,
} from "vue";
import { Popover } from "reka-ui/namespaced";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableActions from "../layers/dms-ui/app/entries/components/table/TableActions";
import type { JsonValue } from "../layers/dms-core/app/types/json";
import { FULL_TABLE_CHROME } from "../layers/dms-ui/app/entries/composables/table-view/utils/chrome";
import { defined } from "./helpers/defined";

const presentError = vi.fn();

const CONFIG = {
  v: 1,
  filters: [{ accessorKey: "status", mode: "is", value: "open" }],
  order: ["status", "title"],
  visibility: { title: false },
  pinning: { left: ["status"] },
  sorting: [{ id: "title", desc: true }],
  pagination: { pageIndex: 2, pageSize: 50 },
  density: "compact",
};

const encode = (config: JsonValue) =>
  window.btoa(unescape(encodeURIComponent(JSON.stringify(config))));

const PassThrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", [slots.default?.(), slots.content?.()]),
});

const ButtonStub = defineComponent({
  props: { label: String, disabled: Boolean },
  setup:
    (props, { attrs }) =>
    () =>
      h("button", { ...attrs, disabled: props.disabled }, props.label),
});

const TextareaStub = defineComponent({
  props: { modelValue: String },
  emits: ["update:modelValue"],
  setup:
    (props, { emit }) =>
    () =>
      h("textarea", {
        value: props.modelValue,
        onInput: (event: Event) => {
          if (event.target instanceof HTMLTextAreaElement)
            emit("update:modelValue", event.target.value);
        },
      }),
});

const PopoverStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h(Popover.Root, { open: true }, () => [
        slots.default?.(),
        h(Popover.Content, { forceMount: true }, () => slots.content?.()),
      ]),
});

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let app: App | undefined;

const createTableState = () => ({
  globalFilterState: ref(""),
  columnFiltersState: ref([]),
  columnOrderState: ref([]),
  columnVisibilityState: ref({}),
  columnPinningState: ref({}),
  sortingState: ref([]),
  paginationState: ref({ pageIndex: 0, pageSize: 10 }),
  densityState: ref("default"),
});

let state: ReturnType<typeof createTableState>;

function mountMenu() {
  state = createTableState();
  const Host = defineComponent({
    setup() {
      provide(
        "tableSharedData",
        shallowRef({
          ...state,
          activeCapabilities: ref({
            search: false,
            filters: false,
            sorting: false,
          }),
          hasDisplaySwitcher: false,
          customNavItems: [],
          hasCustomColumns: ref(false),
          labeledColumns: ref([]),
          filtersRowOpenState: ref(false),
          hasCustomSort: ref(false),
          displays: [],
          activeDisplayState: ref("table"),
          kanbanGroupByOptions: [],
          kanbanGroupByState: ref(undefined),
          onFiltersCleared: () => undefined,
          emits: () => undefined,
        }),
      );
      return () =>
        h(TableActions, {
          chrome: { ...FULL_TABLE_CHROME, refresh: false, menu: true },
        });
    },
  });
  app = createApp(Host);
  for (const [name, stub] of Object.entries({
    UButton: ButtonStub,
    UTextarea: TextareaStub,
    UChip: PassThrough,
    UKbd: PassThrough,
    UPopover: PopoverStub,
    UDropdownMenu: PassThrough,
    UTooltip: PassThrough,
    UIcon: PassThrough,
    Icon: PassThrough,
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  return container;
}

async function importCode(code: string) {
  const container = mountMenu();
  const entry = [...container.querySelectorAll("li")].find(
    (item) => item.textContent?.trim() === "dms.table.import_config",
  );
  entry?.click();
  await nextTick();
  const field = defined(container.querySelector("textarea"));
  field.value = code;
  field.dispatchEvent(new Event("input"));
  await nextTick();
  const apply = defined(
    [...container.querySelectorAll("button")].find(
      (button) => button.textContent === "dms.table.import_config_apply",
    ),
  );
  apply.click();
  await nextTick();
  return container;
}

describe("importing a table config", () => {
  beforeEach(() => {
    presentError.mockReset();
    vi.stubGlobal("ResizeObserver", FakeResizeObserver);
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("watch", watch);
    vi.stubGlobal("defineShortcuts", () => undefined);
    vi.stubGlobal("useDmsAppConfig", () => ({
      ui: { icons: { close: "close", plus: "plus", ellipsis: "ellipsis" } },
    }));
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (value: string) => value,
    }));
    vi.stubGlobal("useApiErrorPresenter", () => ({ presentError }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    document.body.replaceChildren();
    vi.unstubAllGlobals();
  });

  it("applies a config an export wrote", async () => {
    const container = await importCode(encode(CONFIG));
    expect(state.paginationState.value).toEqual({
      pageIndex: 2,
      pageSize: 50,
    });
    expect(state.sortingState.value).toEqual([{ id: "title", desc: true }]);
    expect(state.densityState.value).toBe("compact");
    expect(container.querySelector("textarea")).toBeNull();
  });

  it("refuses a config whose sorting holds a non-sort entry", async () => {
    const container = await importCode(
      encode({ ...CONFIG, sorting: ["title"] }),
    );
    expect(presentError).toHaveBeenCalledOnce();
    expect(state.sortingState.value).toEqual([]);
    expect(container.querySelector("textarea")).not.toBeNull();
  });

  it("refuses a config missing its pagination", async () => {
    const { pagination: _pagination, ...partial } = CONFIG;
    await importCode(encode(partial));
    expect(presentError).toHaveBeenCalledOnce();
    expect(state.paginationState.value).toEqual({
      pageIndex: 0,
      pageSize: 10,
    });
  });

  it("refuses a config of another version", async () => {
    await importCode(encode({ ...CONFIG, v: 2 }));
    expect(presentError).toHaveBeenCalledOnce();
    expect(state.densityState.value).toBe("default");
  });
});
