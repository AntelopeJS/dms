import { computed, effectScope, nextTick, reactive, ref, watch } from "vue";
import type { EffectScope } from "vue";
import { afterEach, expect, it, vi } from "vitest";
import { usePageLayout } from "../layers/dms-layout/app/composables/page/usePageLayout";

let scope: EffectScope;

afterEach(() => {
  scope?.stop();
  vi.unstubAllGlobals();
});

it("loads a page registered after setup without changing the route", async () => {
  const route = { path: "/new-page" };
  const layoutUrl = ref<string>();
  const pageLayouts = ref<Record<string, string>>({});
  const loadPageLayout = vi.fn(async (url: string) => {
    pageLayouts.value[url] = url;
    return url;
  });
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useSiteLayout", () => ({
    pageLayouts,
    findMatchingRoute: () =>
      layoutUrl.value
        ? { metadata: { layoutUrl: layoutUrl.value } }
        : undefined,
    loadPageLayout,
  }));
  scope = effectScope();
  const { pageLayout } = await scope.run(usePageLayout)!;
  expect(pageLayout.value).toBeNull();
  expect(loadPageLayout).not.toHaveBeenCalled();

  layoutUrl.value = "/new-page/pagelayout";
  await nextTick();
  expect(loadPageLayout).toHaveBeenCalledExactlyOnceWith(
    "/new-page/pagelayout",
  );
  expect(pageLayout.value).toBe("/new-page/pagelayout");
  expect(route.path).toBe("/new-page");
});

it("keeps persistent consumers on the hydrated navigation cache without fetching", async () => {
  const route = reactive({ path: "/first" });
  const pageLayouts = ref<Record<string, string>>({ "/first/layout": "first" });
  const loadPageLayout = vi.fn();
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useSiteLayout", () => ({
    pageLayouts,
    loadPageLayout,
    findMatchingRoute: (path: string) => ({
      metadata: { layoutUrl: `${path}/layout` },
    }),
  }));
  scope = effectScope();
  const layout = await scope.run(usePageLayout)!;
  const page = await scope.run(usePageLayout)!;
  expect(layout.pageLayout.value).toBe("first");
  pageLayouts.value = { "/second/layout": "second" };
  route.path = "/second";
  await nextTick();
  expect(layout.pageLayout.value).toBe("second");
  expect(page.pageLayout.value).toBe("second");
  expect(loadPageLayout).not.toHaveBeenCalled();
});
