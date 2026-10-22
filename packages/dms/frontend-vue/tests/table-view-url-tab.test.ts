// @vitest-environment jsdom
/**
 * A table view opens the tab its URL names (`?<tableId>.tab=`, or `?tab=` on
 * a page with a single table view), on arrival and afterwards: a link or a
 * `router.replace` naming another tab switches to it in place, without
 * remounting the page. A tab the user opens is written back to the URL in
 * place, under the same key.
 */
import { createApp, defineComponent, h, nextTick, reactive, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  readTableUrlTab,
  useTableUrlTab,
} from "../layers/dms-ui/app/build/composables/table-view/useTableUrlTab";
import type { TableUrlScope } from "../layers/dms-ui/app/build/composables/table-view/utils/views";

type NavigateListener = (event: { detail: { page: { url: string } } }) => void;
const navigateListeners = new Set<NavigateListener>();

vi.mock("@inertiajs/vue3", () => ({
  router: {
    on: (type: string, listener: NavigateListener) => {
      if (type !== "navigate") return () => {};
      navigateListeners.add(listener);
      return () => navigateListeners.delete(listener);
    },
  },
}));

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

beforeEach(() => {
  window.history.replaceState(null, "", "/runs");
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

/** A visit of the page already shown: Inertia announces its URL. */
async function visit(url: string) {
  window.history.pushState(null, "", url);
  navigateListeners.forEach((listener) =>
    listener({ detail: { page: { url } } }),
  );
  await nextTick();
}

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

describe("the tab the user opens", () => {
  it("is written to the short key in place on a single table view", async () => {
    window.history.replaceState(null, "", "/runs?page=2");
    const { activeTabId } = mountTable(
      { tableId: "runs", isSoleTableView: true },
      {},
    );
    const entries = window.history.length;
    activeTabId.value = "archived";
    await nextTick();
    expect(window.location.search).toBe("?page=2&tab=archived");
    expect(window.history.length).toBe(entries);
    activeTabId.value = "all";
    await nextTick();
    expect(window.location.search).toBe("?page=2&tab=all");
  });

  it("replaces the prefixed key a link set on a single table view", async () => {
    window.history.replaceState(null, "", "/runs?runs.tab=active");
    const scope = { tableId: "runs", isSoleTableView: true };
    const { activeTabId } = mountTable(scope, { "runs.tab": "active" });
    activeTabId.value = "archived";
    await nextTick();
    expect(window.location.search).toBe("?tab=archived");
    // A reload reads the tab the user opened, not the link's.
    const reloaded = Object.fromEntries(
      new URLSearchParams(window.location.search),
    );
    expect(readTableUrlTab(reloaded, scope)).toBe("archived");
  });

  it("is written to the table's own key on a page with several tables", async () => {
    window.history.replaceState(null, "", "/runs?jobs.tab=late");
    const { activeTabId } = mountTable({ tableId: "runs" }, {});
    activeTabId.value = "active";
    await nextTick();
    expect(window.location.search).toBe("?jobs.tab=late&runs.tab=active");
  });

  it("leaves the URL alone for a tab it cannot open in place", async () => {
    const { activeTabId } = mountTable({ tableId: "runs" }, {});
    activeTabId.value = "docs";
    await nextTick();
    expect(window.location.search).toBe("");
  });

  it("gives way to a link back to the tab the page was opened on", async () => {
    window.history.replaceState(null, "", "/runs?runs.tab=active");
    const { route, activeTabId } = mountTable(
      { tableId: "runs" },
      { "runs.tab": "active" },
    );
    activeTabId.value = "archived";
    await nextTick();
    expect(window.location.search).toBe("?runs.tab=archived");
    // The route still holds the arrival's tab: only the visit tells.
    await visit("/runs?runs.tab=active");
    expect(route.query["runs.tab"]).toBe("active");
    expect(activeTabId.value).toBe("active");
  });

  it("stops following visits once the table is gone", async () => {
    const { activeTabId } = mountTable({ tableId: "runs" }, {});
    mounted.splice(0).forEach((app) => app.unmount());
    await visit("/runs?runs.tab=archived");
    expect(activeTabId.value).toBe("all");
  });
});
