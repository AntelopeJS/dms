import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectPageLayoutComponentNames,
  PAGE_COMPONENTS_WAIT_MS,
  preloadPageLayoutComponents,
} from "../layers/dms-layout/app/composables/page/usePageComponentPreload";

const LAYOUT = {
  layout: {
    componentName: "dms-default-layout",
    children: [{ component: { componentName: "PageBanner" } }],
  },
  components: {
    main: {
      componentName: "DmsCard",
      children: [{ component: { componentName: "DmsTable" } }],
    },
  },
} as never;

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.useRealTimers();
});

function stubLazyComponents() {
  const pending = new Map<string, () => void>();
  vi.stubGlobal("resolveDmsComponent", (name: string) => ({
    __asyncLoader: () =>
      new Promise<void>((resolve) => pending.set(name, resolve)),
  }));
  return pending;
}

const settled = async (promise: Promise<void>) => {
  let isSettled = false;
  void promise.then(() => (isSettled = true));

  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  return isSettled;
};

describe("the preload of a page's components", () => {
  it("leaves the layout itself to the renderer, and takes its children", () => {
    expect(collectPageLayoutComponentNames(LAYOUT)).toEqual([
      "PageBanner",
      "DmsCard",
      "DmsTable",
    ]);
  });

  it("looks up only components among the components", () => {
    vi.stubEnv("SSR", false);
    const resolve = vi.fn((_name: string) => undefined);
    vi.stubGlobal("resolveDmsComponent", resolve);
    preloadPageLayoutComponents(LAYOUT);
    expect(resolve.mock.calls.map(([name]) => name)).toEqual([
      "PageBanner",
      "DmsCard",
      "DmsTable",
    ]);
  });

  it("settles once every chunk is in, for the page's setup to await", async () => {
    vi.stubEnv("SSR", false);
    const pending = stubLazyComponents();
    const preloaded = preloadPageLayoutComponents(LAYOUT);
    expect(await settled(preloaded)).toBe(false);

    pending.get("PageBanner")!();
    pending.get("DmsCard")!();
    expect(await settled(preloaded)).toBe(false);
    pending.get("DmsTable")!();
    expect(await settled(preloaded)).toBe(true);
  });

  it("stops waiting for a chunk that hangs", async () => {
    vi.useFakeTimers();
    vi.stubEnv("SSR", false);
    stubLazyComponents();
    const preloaded = preloadPageLayoutComponents(LAYOUT);
    vi.advanceTimersByTime(PAGE_COMPONENTS_WAIT_MS);
    expect(await settled(preloaded)).toBe(true);
  });
});
