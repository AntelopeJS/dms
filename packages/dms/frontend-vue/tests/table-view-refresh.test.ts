// @vitest-environment jsdom
/**
 * A table view reads its rows again when they moved without a write through
 * its own routes: on each event of its `realtimeTopic`, and each time the page
 * asks its blocks to refresh (refreshPageBlocks). The re-read goes through the
 * same refresh as the toolbar's button, which keeps the rows on screen.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createApp, defineComponent, h } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { RealtimeTopicHandler } from "../layers/dms-core/app/composables/realtime/useUserRealtime";
import { refreshPageBlocks } from "../layers/dms-ui/app/utils/blockRefresh";

const topicHandlers = new Map<string, RealtimeTopicHandler>();

vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: (topic: string, handler: RealtimeTopicHandler) => {
    topicHandlers.set(topic, handler);
  },
}));

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

const tableViewSource = readFileSync(
  resolve(
    __dirname,
    "../layers/dms-ui/app/components/table-view/TableView.vue",
  ),
  "utf8",
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

beforeEach(() => topicHandlers.clear());

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
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

it("refreshes on each event of any of its topics, not on a snapshot", () => {
  const block = mountBlock([UPLOADS_TOPIC, "media:jobs"]);
  expect([...topicHandlers.keys()]).toEqual([UPLOADS_TOPIC, "media:jobs"]);

  topicHandlers.get(UPLOADS_TOPIC)?.({ type: "batch.done" } as never);
  topicHandlers.get("media:jobs")?.({ type: "job.done" } as never);
  topicHandlers.get(UPLOADS_TOPIC)?.({ entries: [] } as never);
  expect(block.onRefresh).toHaveBeenCalledTimes(2);
});

it("wires the table view's realtimeTopic and page refresh to its refresh", () => {
  expect(tableViewSource).toMatch(/realtimeTopic\?: string \| string\[\];/);
  expect(tableViewSource).toContain(
    "useRefreshTriggers(props.realtimeTopic, () => void refreshAll());",
  );
});
