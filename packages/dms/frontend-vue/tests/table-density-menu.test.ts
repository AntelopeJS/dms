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
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import TableMenuDensity from "../layers/dms-ui/app/build/components/table/MenuDensity.vue";
import TableMenuRoot from "../layers/dms-ui/app/build/components/table/MenuRoot.vue";

const tableViewSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
);

describe("table density menu", () => {
  let app: App | undefined;

  const mount = (
    component: ReturnType<typeof defineComponent>,
    sharedData: Record<string, unknown>,
  ) => {
    const Host = defineComponent({
      setup() {
        provide("tableSharedData", shallowRef(sharedData));
        return () => h(component);
      },
    });
    app = createApp(Host);
    app.component(
      "Icon",
      defineComponent({
        props: { name: String },
        setup: (props) => () => h("i", { "data-icon": props.name }),
      }),
    );
    app.component(
      "UChip",
      defineComponent({
        setup:
          (_, { slots }) =>
          () =>
            slots.default?.(),
      }),
    );
    app.component("UKbd", defineComponent({ setup: () => () => h("kbd") }));
    const container = document.createElement("div");
    app.mount(container);
    return container;
  };

  beforeEach(() => {
    vi.stubGlobal("computed", computed);
    vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
    vi.stubGlobal("useDmsAppConfig", () => ({
      ui: { icons: { check: "i-check", chevronRight: "i-chevron" } },
    }));
    vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  });

  afterEach(() => {
    app?.unmount();
    app = undefined;
    vi.unstubAllGlobals();
  });

  it("switches the table to compact rows and marks the active density", async () => {
    const densityState = ref<"default" | "compact">("default");
    const container = mount(TableMenuDensity, { densityState });

    const items = container.querySelectorAll("li");
    expect([...items].map((item) => item.textContent?.trim())).toEqual([
      "dms.table.density_default",
      "dms.table.density_compact",
    ]);
    expect(items[0]!.querySelector('[data-icon="i-check"]')).not.toBeNull();

    (items[1] as HTMLElement).click();
    await nextTick();

    expect(densityState.value).toBe("compact");
    expect(
      container
        .querySelectorAll("li")[1]!
        .querySelector('[data-icon="i-check"]'),
    ).not.toBeNull();
  });

  it("offers the Density entry on the grid only", () => {
    const sharedData = (columnManagement: boolean) => ({
      activeCapabilities: computed(() => ({ columnManagement })),
      hasDisplaySwitcher: false,
      customNavItems: [],
      hasCustomColumns: computed(() => false),
    });
    const labels = (container: HTMLElement) =>
      [...container.querySelectorAll("li")].map((li) => li.textContent?.trim());

    expect(labels(mount(TableMenuRoot, sharedData(true)))).toContain(
      "dms.table.density_title",
    );
    app?.unmount();
    expect(labels(mount(TableMenuRoot, sharedData(false)))).not.toContain(
      "dms.table.density_title",
    );
  });

  it("keeps the user's density with the table state, the module's as default", () => {
    expect(tableViewSource).toMatch(
      /getTablePreferenceKey\("density"\),\s*props\.density \?\? DEFAULT_DENSITY/,
    );
    expect(tableViewSource).toMatch(
      /groupedGroupBy,\s*density,\s*\} as const;/,
    );
    expect(tableViewSource).toContain('v-model:density="density"');
  });
});
