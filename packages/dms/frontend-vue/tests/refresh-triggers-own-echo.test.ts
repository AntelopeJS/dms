// @vitest-environment jsdom
// A block may skip some of its realtime events: a TableView declared with
// `ignoreOwnRealtimeEvents` skips the ones its own tab's request caused.
import { createApp, defineComponent, h } from "vue";
import { afterEach, expect, it, vi } from "vitest";

type Handler = (event: object) => void;
const handlers = new Map<string, Handler>();

vi.mock("../layers/dms-core/app/composables/realtime/useRealtimeTopic", () => ({
  useRealtimeTopic: (topic: string, handler: Handler) => {
    handlers.set(topic, handler);
  },
}));
vi.mock("../layers/dms-ui/app/build/composables/live/currentPageLive", () => ({
  useLiveGate: (read: () => void) => ({
    trigger: () => read(),
    catchUp: () => read(),
    acknowledge: () => undefined,
  }),
}));

const { useRefreshTriggers } = await import(
  "../layers/dms-ui/app/build/composables/blocks/useRefreshTriggers"
);

let app: ReturnType<typeof createApp> | undefined;

afterEach(() => {
  app?.unmount();
  app = undefined;
  handlers.clear();
});

function mount(skipEvent?: (event: object) => boolean) {
  const refresh = vi.fn();
  app = createApp(
    defineComponent({
      setup() {
        useRefreshTriggers("lang:workspaces", refresh, { skipEvent });
        return () => h("div");
      },
    }),
  );
  app.mount(document.createElement("div"));
  return refresh;
}

const event = (originSessionId?: string) => ({
  topic: "lang:workspaces",
  type: "deleted",
  originSessionId,
  ts: 1,
});

it("skips the events skipEvent names and reads on the others", () => {
  const refresh = mount(
    (e) => (e as { originSessionId?: string }).originSessionId === "tab-a",
  );
  handlers.get("lang:workspaces")!(event("tab-a"));
  expect(refresh).not.toHaveBeenCalled();
  handlers.get("lang:workspaces")!(event("tab-b"));
  handlers.get("lang:workspaces")!(event());
  expect(refresh).toHaveBeenCalledTimes(2);
});

it("reads on every event without skipEvent", () => {
  const refresh = mount();
  handlers.get("lang:workspaces")!(event("tab-a"));
  expect(refresh).toHaveBeenCalledTimes(1);
});
