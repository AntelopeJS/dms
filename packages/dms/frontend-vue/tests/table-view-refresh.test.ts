/** @vitest-environment jsdom */
/**
 * A table view reads its rows again when they moved without a write through
 * its own routes: on each event of its `realtimeTopic`, and each time the page
 * asks its blocks to refresh (refreshPageBlocks). The re-read goes through the
 * same refresh as the toolbar's button, which keeps the rows on screen.
 */
import { createApp, defineComponent, h } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  startTableRealtime,
  stopTableRealtime,
  publishTableEvent,
} from "./helpers/table-runtime";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const UPLOADS_TOPIC = "media:uploads";
const mounted: Array<{ unmount: () => void }> = [];

function mountBlock(topic: string | string[] | undefined) {
  const onRefresh = vi.fn();
  const Block = defineComponent({
    setup() {
      useRefreshTriggers(topic, onRefresh);
      return () => h("div");
    },
  });
  const app = createApp(Block);
  app.mount(document.createElement("div"));
  mounted.push(app);
  return { onRefresh, unmount: () => app.unmount() };
}

beforeEach(startTableRealtime);

afterEach(async () => {
  mounted.splice(0).forEach((app) => app.unmount());
  await stopTableRealtime();
  vi.unstubAllGlobals();
});

it("refreshes on each page refresh while mounted", () => {
  const block = mountBlock(undefined);
  refreshPageBlocks();
  expect(block.onRefresh).toHaveBeenCalledTimes(1);

  block.unmount();
  mounted.length = 0;
  refreshPageBlocks();
  expect(block.onRefresh).toHaveBeenCalledTimes(1);
});

it("refreshes on each event of any of its topics, not on a snapshot", async () => {
  const block = mountBlock([UPLOADS_TOPIC, "media:jobs"]);
  await publishTableEvent(UPLOADS_TOPIC);
  await publishTableEvent("media:jobs");
  await publishTableEvent(UPLOADS_TOPIC, true);
  expect(block.onRefresh).toHaveBeenCalledTimes(2);
  block.unmount();
  mounted.length = 0;
  await publishTableEvent(UPLOADS_TOPIC);
  expect(block.onRefresh).toHaveBeenCalledTimes(2);
});
