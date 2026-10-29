/** @vitest-environment jsdom */
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
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { defineShortcuts } from "@nuxt/ui/runtime/composables/defineShortcuts.js";
import TableActions from "../layers/dms-ui/app/entries/components/table/Actions";
import { FULL_TABLE_CHROME } from "../layers/dms-ui/app/entries/composables/table-view/utils/chrome";

const PassThrough = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("div", slots.default?.()),
});

const ButtonStub = defineComponent({
  setup:
    (_, { slots }) =>
    () =>
      h("button", slots.default?.()),
});

const InputStub = defineComponent({
  inheritAttrs: false,
  setup:
    (_, { attrs }) =>
    () =>
      h("div", [h("input", attrs)]),
});

let app: App | undefined;

function mountActions(
  searchPlaceholder: string | undefined,
  search = "",
  searchShortcut?: string,
) {
  const Host = defineComponent({
    setup() {
      provide(
        "tableSharedData",
        shallowRef({
          activeCapabilities: ref({
            search: true,
            filters: false,
            sorting: false,
          }),
          labeledColumns: ref([]),
          globalFilterState: ref(search),
          columnFiltersState: ref([]),
          paginationState: ref({ pageIndex: 0, pageSize: 10 }),
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
          searchPlaceholder,
          searchShortcut,
          chrome: { ...FULL_TABLE_CHROME, refresh: false, menu: false },
        });
    },
  });
  app = createApp(Host);
  for (const [name, stub] of Object.entries({
    UButton: ButtonStub,
    UInput: InputStub,
    UKbd: PassThrough,
    UPopover: PassThrough,
    UDropdownMenu: PassThrough,
    UTooltip: PassThrough,
    UIcon: PassThrough,
  })) {
    app.component(name, stub);
  }
  const container = document.createElement("div");
  document.body.append(container);
  app.mount(container);
  return container;
}

beforeEach(() => {
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("defineShortcuts", () => undefined);
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { close: "close", plus: "plus", ellipsis: "ellipsis" } },
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
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

describe("table toolbar search", () => {
  it("names the button opening the search", () => {
    const container = mountActions(undefined);
    expect(container.querySelector("button")?.getAttribute("aria-label")).toBe(
      "dms.table.search_open",
    );
  });

  it("opens the search field from its button and focuses it", async () => {
    const container = mountActions(undefined);
    const trigger = container.querySelector("button");
    trigger?.focus();
    trigger?.click();
    await nextTick();
    await nextTick();
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
    await nextTick();
    expect(container.querySelector("input")).not.toBeNull();
  });

  it("uses the configured placeholder, which also names the field", async () => {
    const container = mountActions("$page.members.search", "ada");
    await nextTick();
    const input = container.querySelector("input");
    expect(input?.getAttribute("placeholder")).toBe(
      "translated:page.members.search",
    );
    expect(input?.getAttribute("aria-label")).toBe(
      "translated:page.members.search",
    );
  });

  it("falls back to the default placeholder as the field's name", async () => {
    const container = mountActions(undefined, "ada");
    await nextTick();
    const input = container.querySelector("input");
    expect(input?.getAttribute("placeholder")).toBe(
      "dms.table.search_placeholder",
    );
    expect(input?.getAttribute("aria-label")).toBe(
      "dms.table.search_placeholder",
    );
  });
});

describe("table search shortcut", () => {
  const press = (
    key: string,
    init: KeyboardEventInit = {},
    target: EventTarget = document.body,
  ) =>
    target.dispatchEvent(
      new KeyboardEvent("keydown", { key, bubbles: true, ...init }),
    );
  const settle = async () => {
    await nextTick();
    await nextTick();
  };

  beforeEach(() => {
    vi.stubGlobal("defineShortcuts", defineShortcuts);
    vi.stubGlobal("nextTick", nextTick);
  });

  it("opens and focuses the search on ⇧F by default", async () => {
    const container = mountActions(undefined);
    press("F", { shiftKey: true });
    await settle();
    const input = container.querySelector("input");
    expect(input).not.toBeNull();
    expect(document.activeElement).toBe(input);
  });

  it("opens it on the table's own key, ⇧F no longer bound", async () => {
    const container = mountActions(undefined, "", "/");
    press("F", { shiftKey: true });
    await settle();
    expect(container.querySelector("input")).toBeNull();
    press("/");
    await settle();
    expect(document.activeElement).toBe(container.querySelector("input"));
  });

  it("leaves / to a field the user types in", async () => {
    const container = mountActions(undefined, "", "/");
    const field = document.createElement("input");
    document.body.append(field);
    field.focus();
    press("/", {}, field);
    await settle();
    expect(container.querySelector("input")).toBeNull();
    expect(document.activeElement).toBe(field);
  });
});
