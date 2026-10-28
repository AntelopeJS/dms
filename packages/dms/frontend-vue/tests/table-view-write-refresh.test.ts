// @vitest-environment jsdom
/**
 * A write through a table view (a row or bulk action, a form it opened) can
 * move what the rest of the page shows of the same records: a KPI counting
 * them, a tab's badge. The table asks every block of the page to read its data
 * again, itself among them, instead of reloading its own rows alone; its
 * refresh button still reloads only the table.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, describe, expect, it, vi } from "vitest";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const mounted: Array<{ unmount: () => void }> = [];

function mountBlock(read: () => Promise<void> = () => Promise.resolve()) {
  const onRefresh = vi.fn(read);
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
  it("reaches the table and a KPI of the same page, and waits for both", async () => {
    let finishTable = () => {};
    let finishKpi = () => {};
    const table = mountBlock(
      () =>
        new Promise<void>((resolve) => {
          finishTable = resolve;
        }),
    );
    const kpi = mountBlock(
      () =>
        new Promise<void>((resolve) => {
          finishKpi = resolve;
        }),
    );
    let settled = false;
    const refreshed = refreshPageBlocks().then(() => {
      settled = true;
    });
    expect(table).toHaveBeenCalledTimes(1);
    expect(kpi).toHaveBeenCalledTimes(1);
    await Promise.resolve();
    expect(settled).toBe(false);
    finishTable();
    await Promise.resolve();
    expect(settled).toBe(false);
    finishKpi();
    await refreshed;
    expect(settled).toBe(true);
  });
});
