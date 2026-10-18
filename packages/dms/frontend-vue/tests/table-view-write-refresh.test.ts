// @vitest-environment jsdom
/**
 * A write through a table view (a row or bulk action, a form it opened) can
 * move what the rest of the page shows of the same records: a KPI counting
 * them, a tab's badge. The table asks every block of the page to read its data
 * again, itself among them, instead of reloading its own rows alone; its
 * refresh button still reloads only the table.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: () => {},
}));

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const tableView = readFileSync(
  resolve(__dirname, "../layers/dms-ui/app/components/table-view/TableView.vue"),
  "utf8",
);

const mounted: Array<{ unmount: () => void }> = [];

function mountBlock() {
  const onRefresh = vi.fn(() => Promise.resolve());
  const Block = defineComponent({
    setup() {
      useRefreshTriggers(undefined, onRefresh);
      return () => h("div");
    },
  });
  const app = createApp(Block);
  app.mount(document.createElement("div"));
  mounted.push(app);
  return onRefresh;
}

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
});

describe("a write through a table view", () => {
  it("refreshes the page's blocks, not only the table", () => {
    expect(tableView).toMatch(
      /const refreshAfterWrite = \(\) => refreshPageBlocks\(\);/,
    );
    expect(tableView).toMatch(/refreshCallback: refreshAfterWrite,/);
    // The refresh button and ⌘R reload the table alone.
    expect(tableView).toMatch(/@refresh="refreshByUser"/);
  });

  it("reaches the table and a KPI of the same page, and waits for both", async () => {
    const table = mountBlock();
    const kpi = mountBlock();
    await refreshPageBlocks();
    expect(table).toHaveBeenCalledTimes(1);
    expect(kpi).toHaveBeenCalledTimes(1);
  });
});
