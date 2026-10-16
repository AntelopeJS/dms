import { afterEach, describe, expect, it, vi } from "vitest";
import {
  collectPageLayoutComponentNames,
  preloadPageLayoutComponents,
} from "../layers/dms-layout/app/composables/page/usePageComponentPreload";

// The page's layout component (`dms-default-layout`) is registered as a
// layout, not as a component: the preload looked it up among the components
// on every page, and warned in development that nothing matched it.

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
});

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
});
