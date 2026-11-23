import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectPageLayoutComponentNames,
  PAGE_COMPONENTS_WAIT_MS,
  preloadPageLayoutComponents,
} from "../layers/dms-layout/app/composables/page/usePageComponentPreload";
import { defined } from "./helpers/defined";

const LAYOUT = {
  layout: {
    componentName: "dms-default-layout",
    children: [{ id: "banner", component: { componentName: "PageBanner" } }],
  },
  components: {
    main: {
      componentName: "DmsCardPanel",
      children: [{ id: "table", component: { componentName: "DmsTableRoot" } }],
    },
  },
} satisfies NonNullable<Parameters<typeof collectPageLayoutComponentNames>[0]>;

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

/** Whether `promise` resolved within a few microtask turns; a rejection reads as not settled. */
const settled = async (promise: Promise<void>) => {
  let isResolved = false;
  promise.then(
    () => {
      isResolved = true;
    },
    () => {
      isResolved = false;
    },
  );

  for (let turn = 0; turn < 10; turn++) await Promise.resolve();
  return isResolved;
};

describe("the preload of a page's components", () => {
  it("leaves the layout itself to the renderer, and takes its children", () => {
    expect(collectPageLayoutComponentNames(LAYOUT)).toEqual([
      "PageBanner",
      "DmsCardPanel",
      "DmsTableRoot",
    ]);
  });

  it("looks up only components among the components", async () => {
    vi.stubEnv("SSR", false);
    const resolve = vi.fn((_name: string) => undefined);
    vi.stubGlobal("resolveDmsComponent", resolve);
    const preloaded = preloadPageLayoutComponents(LAYOUT);
    expect(resolve.mock.calls.map(([name]) => name)).toEqual([
      "PageBanner",
      "DmsCardPanel",
      "DmsTableRoot",
    ]);
    await preloaded;
  });

  it("settles once every chunk is in, for the page's setup to await", async () => {
    vi.stubEnv("SSR", false);
    const pending = stubLazyComponents();
    const preloaded = preloadPageLayoutComponents(LAYOUT);
    expect(await settled(preloaded)).toBe(false);

    defined(pending.get("PageBanner"))();
    defined(pending.get("DmsCardPanel"))();
    expect(await settled(preloaded)).toBe(false);
    defined(pending.get("DmsTableRoot"))();
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
