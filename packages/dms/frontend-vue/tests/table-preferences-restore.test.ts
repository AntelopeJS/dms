/** @vitest-environment jsdom */
import {
  computed,
  createApp,
  h,
  nextTick,
  readonly,
  ref,
  shallowRef,
  watch,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { usePreferences } from "../layers/dms-core/app/composables/user/usePreferences";
import { useTablePreferences } from "../layers/dms-ui/app/entries/composables/table-view/useTablePreferences";

const COMPONENT_ID = "orders";
const PAGE_ID = "sales.orders";

beforeEach(() => {
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("readonly", readonly);
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("usePreferences", usePreferences);
  const cookie = ref("");
  vi.stubGlobal("useDmsCookie", () => cookie);
  localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("a table's browser-only state restored once mounted", () => {
  it("is left as it is when it already holds the stored value", async () => {
    const order = ["select", "name", "actions"];
    useTablePreferences(COMPONENT_ID, PAGE_ID).set("columnOrder", order, []);
    const columnOrder = shallowRef(order);
    const app = createApp({
      setup() {
        useTablePreferences(COMPONENT_ID, PAGE_ID).restore(
          "columnOrder",
          columnOrder,
        );
        return () => h("span", columnOrder.value.join());
      },
    });

    app.mount(document.createElement("div"));
    await nextTick();

    expect(columnOrder.value).toBe(order);
    app.unmount();
  });
});
