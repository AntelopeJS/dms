// @vitest-environment jsdom
/**
 * A relation filter holds the related rows' ids: its chip names the rows
 * ("Acme"), read once from the relation's `select` route as its picker does,
 * rather than the raw id ("cust-060"). An id the route does not answer keeps
 * showing as is.
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
  type App,
  type FunctionalComponent,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableFiltersRow from "../layers/dms-ui/app/build/components/table/FiltersRow.vue";
import type { TableFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";
import { relationSelectSource } from "../layers/dms-ui/app/build/composables/data-types/relationRows";

const SEARCH_URL = "/api/customers/select";

const RELATION_TYPE = {
  id: "relation",
  filterComponents: {
    default: {
      componentName: "dms-relation",
      options: {
        searchUrl: SEARCH_URL,
        keyMapping: { label: "name", value: "_id" },
      },
    },
  },
};

const ROWS: Record<string, { _id: string; name: string }> = {
  "cust-060": { _id: "cust-060", name: "Acme" },
  "cust-061": { _id: "cust-061", name: "Globex" },
};

const authFetch = vi.fn(
  async (_url: string, options: { params: { ids: string[] } }) => ({
    results: options.params.ids.flatMap((id) => (ROWS[id] ? [ROWS[id]] : [])),
  }),
);

let app: App | undefined;

const flush = async () => {
  for (let tick = 0; tick < 4; tick++) await nextTick();
};

async function mount(filters: TableFilter[]) {
  const Host = defineComponent({
    setup() {
      provide(
        "tableSharedData",
        shallowRef({
          columnFiltersState: ref(filters),
          labeledColumns: computed(() => [
            {
              column: { id: "customer", columnDef: { type: RELATION_TYPE } },
              label: "Customer",
            },
          ]),
          clearableFilters: computed(() => ({
            filters: false,
            search: false,
          })),
          urlFilters: [],
          emits: vi.fn(),
        }),
      );
      return () => h(TableFiltersRow);
    },
  });
  app = createApp(Host);
  const passthrough =
    (tag: string): FunctionalComponent =>
    (_props, { slots }) =>
      h(tag, slots.default?.());
  app.component("UPopover", passthrough("div"));
  app.component("UButton", passthrough("button"));
  app.component("UIcon", passthrough("i"));
  app.component("Suspense", passthrough("div"));
  const container = document.createElement("div");
  app.mount(container);
  await flush();
  return container;
}

const chipValues = (container: HTMLElement) =>
  [...container.querySelectorAll("li button[title]")].map((chip) =>
    chip.lastElementChild?.textContent?.trim(),
  );

beforeEach(() => {
  authFetch.mockClear();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("useI18n", () => ({
    t: (key: string) => key,
    locale: ref("en"),
  }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (text: string) => text,
  }));
  vi.stubGlobal("useDmsAppConfig", () => ({
    ui: { icons: { close: "i-close", plus: "i-plus" } },
  }));
  // The relation data type says where its rows live; no component name.
  vi.stubGlobal("useDataTypes", () => ({
    getDataType: (id: string) =>
      id === "relation"
        ? { id, selectSource: relationSelectSource }
        : undefined,
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal("resolveDmsComponent", () => undefined);
});

afterEach(() => {
  app?.unmount();
  app = undefined;
  vi.unstubAllGlobals();
});

describe("a relation filter chip", () => {
  it("leaves the id of a type that names no select source", async () => {
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    const container = await mount([
      { accessorKey: "customer", mode: "is", value: "cust-060" },
    ]);
    expect(authFetch).not.toHaveBeenCalled();
    expect(chipValues(container)).toEqual(["cust-060"]);
  });

  it("names the related row instead of its id", async () => {
    const container = await mount([
      { accessorKey: "customer", mode: "is", value: "cust-060" },
    ]);
    expect(authFetch).toHaveBeenCalledWith(SEARCH_URL, {
      params: { ids: ["cust-060"], idKey: "_id", limit: 1 },
    });
    expect(chipValues(container)).toEqual(["Acme"]);
  });

  it("names each row of a multiple value, and keeps an unknown id", async () => {
    const container = await mount([
      {
        accessorKey: "customer",
        mode: "is",
        value: ["cust-061", "cust-999"],
      },
    ]);
    expect(chipValues(container)).toEqual(["Globex, cust-999"]);
    expect(authFetch).toHaveBeenCalledTimes(1);
  });
});
