// @vitest-environment jsdom
/**
 * Once an action changes the record a page shows, its data blocks read their
 * data again in place: `refreshPageBlocks()` (or the `REFRESH_PAGE` watch
 * function a form names) re-fetches every mounted block, keeps what it shows
 * until the answer lands, and leaves an unmounted block alone.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  BlockFunctions,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";

const requests: string[] = [];
let answer = 1;

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string) => {
    requests.push(url);
    return { value: answer };
  },
}));
vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
vi.stubGlobal("ref", ref);

const { useChartFetch } = await import(
  "../layers/dms-ui/app/composables/chart/useChartFetch"
);
const { useDefinedFunctions } = await import(
  "../layers/dms-core/app/composables/functions/useDefinedFunction"
);
vi.stubGlobal("useDefinedFunctions", useDefinedFunctions);
const { registerBlockFunctions } = await import(
  "../layers/dms-ui/app/build/composables/blocks/registerBlockFunctions"
);

// useChartFetch debounces every refresh past the first by 180ms.
const SETTLE_MS = 250;
const settle = () => new Promise((resolve) => setTimeout(resolve, SETTLE_MS));

interface Probe {
  data?: { value: { value: number } | null };
  isLoading?: { value: boolean };
}

function mountBlock(fetchUrl: string) {
  const probe: Probe = {};
  const Block = defineComponent({
    setup() {
      const { data, isLoading } = useChartFetch<{ value: number }>({
        fetchUrl,
        routeParams: () => ({ id: "ws-1" }),
      });
      probe.data = data;
      probe.isLoading = isLoading;
      return () => h("div");
    },
  });
  const app = createApp(Block);
  app.mount(document.createElement("div"));
  return { probe, unmount: () => app.unmount() };
}

const apps: Array<() => void> = [];

beforeEach(() => {
  requests.length = 0;
  answer = 1;
});

afterEach(() => {
  apps.splice(0).forEach((unmount) => unmount());
});

it("re-fetches every mounted block, keeping its values until the answer", async () => {
  const facts = mountBlock("/api/ws/{{params.id}}/facts");
  const counts = mountBlock("/api/ws/{{params.id}}/tab-counts");
  apps.push(facts.unmount, counts.unmount);
  await settle();
  expect(requests).toEqual(["/api/ws/ws-1/facts", "/api/ws/ws-1/tab-counts"]);

  answer = 2;
  refreshPageBlocks();
  expect(facts.probe.isLoading?.value).toBe(false);
  expect(facts.probe.data?.value).toEqual({ value: 1 });
  await settle();

  expect(requests).toEqual([
    "/api/ws/ws-1/facts",
    "/api/ws/ws-1/tab-counts",
    "/api/ws/ws-1/facts",
    "/api/ws/ws-1/tab-counts",
  ]);
  expect(facts.probe.data?.value).toEqual({ value: 2 });
});

it("leaves an unmounted block alone", async () => {
  const block = mountBlock("/api/ws/{{params.id}}/facts");
  await settle();
  block.unmount();
  refreshPageBlocks();
  await settle();
  expect(requests).toEqual(["/api/ws/ws-1/facts"]);
});

it("does not request a URL whose token is unresolved", async () => {
  const block = mountBlock("/api/ws/{{params.workspace}}/facts");
  apps.push(block.unmount);
  refreshPageBlocks();
  await settle();
  expect(requests).toEqual([]);
});

it("runs from the REFRESH_PAGE watch function", async () => {
  registerBlockFunctions();
  const block = mountBlock("/api/ws/{{params.id}}/facts");
  apps.push(block.unmount);
  await settle();

  const refresh = useDefinedFunctions().getFunction(
    BlockFunctions.REFRESH_PAGE,
  );
  expect(refresh).toBeTypeOf("function");
  refresh?.();
  await settle();
  expect(requests).toEqual(["/api/ws/ws-1/facts", "/api/ws/ws-1/facts"]);
});
