// @vitest-environment jsdom
/**
 * A table view opens the tab its URL names (`?<tableId>.tab=`, or `?tab=` on
 * a page with a single table view), on arrival and afterwards: a link or a
 * `router.replace` naming another tab switches to it in place, without
 * remounting the page.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { afterEach, describe, expect, it } from "vitest";
import {
  readTableUrlTab,
  useTableUrlTab,
} from "../layers/dms-ui/app/build/composables/table-view/useTableUrlTab";
import type { TableUrlScope } from "../layers/dms-ui/app/build/composables/table-view/utils/views";

const OPENABLE_TABS = new Set(["all", "active", "archived"]);
const mounted: Array<{ unmount: () => void }> = [];

function mountTable(scope: TableUrlScope, query: Record<string, string>) {
  const route = reactive({ query });
  const activeTabId = ref(readTableUrlTab(route.query, scope) ?? "all");
  const app = createApp(
    defineComponent({
      setup() {
        useTableUrlTab({
          route,
          urlScope: scope,
          activeTabId,
          isOpenable: (tabId) => OPENABLE_TABS.has(tabId),
        });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  mounted.push(app);
  return { route, activeTabId };
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("the tab a URL names", () => {
  it("opens on arrival", () => {
    const { activeTabId } = mountTable(
      { tableId: "runs" },
      { "runs.tab": "active" },
    );
    expect(activeTabId.value).toBe("active");
  });

  it("switches the tab when the prefixed key changes after mount", async () => {
    const { route, activeTabId } = mountTable({ tableId: "runs" }, {});
    route.query = { "runs.tab": "archived" };
    await nextTick();
    expect(activeTabId.value).toBe("archived");
  });

  it("follows the short key on a page with a single table view", async () => {
    const { route, activeTabId } = mountTable(
      { tableId: "runs", isSoleTableView: true },
      { tab: "active" },
    );
    expect(activeTabId.value).toBe("active");
    route.query = { tab: "archived" };
    await nextTick();
    expect(activeTabId.value).toBe("archived");
  });

  it("ignores the short key on a page with several table views", async () => {
    const { route, activeTabId } = mountTable({ tableId: "runs" }, {});
    route.query = { tab: "archived" };
    await nextTick();
    expect(activeTabId.value).toBe("all");
  });

  it("keeps the open tab when the key is dropped or unknown", async () => {
    const { route, activeTabId } = mountTable(
      { tableId: "runs" },
      { "runs.tab": "active" },
    );
    route.query = {};
    await nextTick();
    expect(activeTabId.value).toBe("active");
    route.query = { "runs.tab": "missing" };
    await nextTick();
    expect(activeTabId.value).toBe("active");
  });

  it("lets the user change tabs while the URL stays put", async () => {
    const { route, activeTabId } = mountTable(
      { tableId: "runs" },
      { "runs.tab": "active" },
    );
    activeTabId.value = "archived";
    route.query = { "runs.tab": "active", other: "1" };
    await nextTick();
    expect(activeTabId.value).toBe("archived");
  });
});

it("wires the URL tab into the table view", () => {
  const source = readFileSync(
    resolve(
      __dirname,
      "../layers/dms-ui/app/components/table-view/TableView.vue",
    ),
    "utf8",
  );
  expect(source).toContain("readTableUrlTab(route.query, urlScope)");
  expect(source).toContain("useTableUrlTab({");
});
