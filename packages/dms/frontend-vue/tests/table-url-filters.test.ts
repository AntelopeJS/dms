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
  type FunctionalComponent,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import TableFiltersRow from "../layers/dms-ui/app/build/components/table/FiltersRow.vue";
import type { TableUrlFilter } from "../layers/dms-ui/app/build/components/table/Table.vue";
import {
  visibleUrlFilters,
  withoutQueryParam,
} from "../layers/dms-ui/app/build/composables/table-view/utils/urlFilters";

describe("visibleUrlFilters", () => {
  const declared = {
    email: { field: "email", visible: true, label: "$app.email" },
    template: { field: "templateSlug", mode: "is_not", visible: true },
    tenant: { field: "tenantId" },
  };

  it("lists the visible filters the URL applies, hidden ones left out", () => {
    expect(
      visibleUrlFilters(declared, {
        email: "a@b.test",
        tenant: "t1",
        page: "2",
      }),
    ).toEqual([
      {
        param: "email",
        label: "$app.email",
        accessorKey: "email",
        mode: "is",
        value: "a@b.test",
      },
    ]);
    expect(visibleUrlFilters(declared, { template: "welcome" })).toEqual([
      {
        param: "template",
        label: undefined,
        accessorKey: "templateSlug",
        mode: "is_not",
        value: "welcome",
      },
    ]);
    expect(visibleUrlFilters(undefined, { email: "a@b.test" })).toEqual([]);
  });

  it("removes one parameter from the query", () => {
    expect(withoutQueryParam({ email: "a", tab: "all" }, "email")).toEqual({
      tab: "all",
    });
  });
});

describe("filters row URL chips", () => {
  let app: App | undefined;
  const emits = vi.fn();

  const mount = (urlFilters: TableUrlFilter[]) => {
    const Host = defineComponent({
      setup() {
        provide(
          "tableSharedData",
          shallowRef({
            columnFiltersState: ref([]),
            labeledColumns: computed(() => [
              {
                column: { id: "templateSlug", columnDef: {} },
                label: "Template",
              },
            ]),
            clearableFilters: computed(() => ({
              filters: false,
              search: false,
            })),
            urlFilters,
            emits,
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
    return container;
  };

  beforeEach(() => {
    emits.mockClear();
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("useI18n", () => ({
      t: (key: string) => key,
      locale: ref("en"),
    }));
    vi.stubGlobal("useTranslation", () => ({
      processI18n: (text: string) =>
        text.startsWith("$") ? `t:${text.slice(1)}` : text,
    }));
    vi.stubGlobal("useDmsAppConfig", () => ({
      ui: { icons: { close: "i-close", plus: "i-plus" } },
    }));
    vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
    vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
    vi.stubGlobal("resolveDmsComponent", () => undefined);
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("draws a chip per URL filter and asks to remove its parameter", async () => {
    const container = mount([
      {
        param: "email",
        label: "$app.email",
        accessorKey: "email",
        mode: "is",
        value: "a@b.test",
      },
      {
        param: "template",
        accessorKey: "templateSlug",
        mode: "is",
        value: "welcome",
      },
    ]);
    const chips = container.querySelectorAll("[data-dms-url-filter]");
    expect(chips).toHaveLength(2);
    expect(chips[0]!.textContent).toContain("t:app.email");
    expect(chips[0]!.textContent).toContain("a@b.test");
    expect(chips[1]!.textContent).toContain("Template");

    chips[1]!.querySelector("button")!.click();
    await nextTick();
    expect(emits).toHaveBeenCalledWith("removeUrlFilter", "template");
  });
});
