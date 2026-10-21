// @vitest-environment jsdom
/**
 * Once an action changes the record a page shows, its data blocks read their
 * data again in place: `refreshPageBlocks()` (or the `REFRESH_PAGE` watch
 * function a form names) re-fetches every mounted block, keeps what it shows
 * until the answer lands, and leaves an unmounted block alone.
 */
import { createApp, defineComponent, h, ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useRealDataEngine } from "./fixtures/dataEngine";
import {
  BlockFunctions,
  refreshLivePageBlocks,
  refreshPageBlocks,
} from "../layers/dms-ui/app/utils/blockRefresh";

const requests: string[] = [];
let answer = 1;
interface FetchOptions {
  signal: AbortSignal;
}
interface Answer {
  value: number;
}
interface DeferredRead {
  signal: AbortSignal;
  resolve: (value: Answer) => void;
  reject: (reason: unknown) => void;
}
let deferredReads: DeferredRead[] | null = null;

vi.stubGlobal("useAuthFetch", () => ({
  $authFetch: async (url: string, options: FetchOptions) => {
    requests.push(url);
    if (deferredReads)
      return new Promise<Answer>((resolve, reject) => {
        deferredReads?.push({ signal: options.signal, resolve, reject });
        options.signal.addEventListener("abort", () =>
          reject(new DOMException("Aborted", "AbortError")),
        );
      });
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

function mountBlock(fetchUrl: string, refreshOnPageRefresh?: boolean) {
  const probe: Probe = {};
  const Block = defineComponent({
    setup() {
      const { data, isLoading } = useChartFetch<{ value: number }>({
        fetchUrl,
        routeParams: () => ({ id: "ws-1" }),
        refreshOnPageRefresh,
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

beforeEach(() => useRealDataEngine());

beforeEach(() => {
  requests.length = 0;
  answer = 1;
  deferredReads = null;
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

it("resolves once every block read the new answer", async () => {
  const facts = mountBlock("/api/ws/{{params.id}}/facts");
  const counts = mountBlock("/api/ws/{{params.id}}/tab-counts");
  apps.push(facts.unmount, counts.unmount);
  await settle();

  answer = 2;
  await refreshPageBlocks();
  // No wait of its own: what the caller (a form that saved) reads next is
  // the new answer of every block.
  expect(facts.probe.data?.value).toEqual({ value: 2 });
  expect(counts.probe.data?.value).toEqual({ value: 2 });
});

it("does not wait on a block unmounted before its read", async () => {
  const block = mountBlock("/api/ws/{{params.id}}/facts");
  await settle();
  const refreshed = refreshPageBlocks();
  block.unmount();
  await expect(refreshed).resolves.toBeUndefined();
});

it("keeps both refresh callers waiting for the replacement read", async () => {
  const block = mountBlock("/api/ws/{{params.id}}/facts");
  apps.push(block.unmount);
  await settle();
  deferredReads = [];
  let firstDone = false;
  let secondDone = false;
  const first = refreshPageBlocks().then(() => (firstDone = true));
  await settle();
  const second = refreshPageBlocks().then(() => (secondDone = true));
  await settle();

  expect(deferredReads).toHaveLength(2);
  expect(deferredReads[0]!.signal.aborted).toBe(true);
  expect(block.probe.data?.value).toEqual({ value: 1 });
  expect(block.probe.isLoading?.value).toBe(true);
  expect({ firstDone, secondDone }).toEqual({
    firstDone: false,
    secondDone: false,
  });
  deferredReads[1]!.resolve({ value: 2 });
  await Promise.all([first, second]);
  expect(block.probe.data?.value).toEqual({ value: 2 });
  expect(block.probe.isLoading?.value).toBe(false);
});

it("releases active refresh callers when the block unmounts", async () => {
  const block = mountBlock("/api/ws/{{params.id}}/facts");
  await settle();
  deferredReads = [];
  const first = refreshPageBlocks();
  await settle();
  const second = refreshPageBlocks();
  await settle();
  block.unmount();
  await expect(Promise.all([first, second])).resolves.toEqual([
    undefined,
    undefined,
  ]);
  expect(deferredReads.every((read) => read.signal.aborted)).toBe(true);
});

it.each([new Error("Unavailable"), new DOMException("Aborted", "AbortError")])(
  "releases refresh callers when the final read fails: %s",
  async (failure) => {
    const block = mountBlock("/api/ws/{{params.id}}/facts");
    apps.push(block.unmount);
    await settle();
    deferredReads = [];
    const refreshed = refreshPageBlocks();
    await settle();
    deferredReads[0]!.reject(failure);
    await expect(refreshed).resolves.toBeUndefined();
    expect(block.probe.isLoading?.value).toBe(false);
    expect(block.probe.data?.value).toEqual({ value: 1 });
  },
);

it("leaves a block that opted out of page refreshes alone, live refreshes still reading it", async () => {
  const block = mountBlock("/api/ws/{{params.id}}/attention", false);
  apps.push(block.unmount);
  await settle();
  await refreshPageBlocks();
  await settle();
  expect(requests).toEqual(["/api/ws/ws-1/attention"]);
  refreshLivePageBlocks();
  await settle();
  expect(requests).toEqual([
    "/api/ws/ws-1/attention",
    "/api/ws/ws-1/attention",
  ]);
});
