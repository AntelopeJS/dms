// @vitest-environment jsdom
import {
  computed,
  createApp,
  defineComponent,
  h,
  nextTick,
  onUnmounted,
  reactive,
  ref,
  Suspense,
  watch,
  type App,
  type Ref,
} from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { usePageLayout } from "../layers/dms-layout/app/composables/page/usePageLayout";
import { useSiteLayout } from "../layers/dms-layout/app/composables/page/useSiteLayout";
import type { PageLayout } from "../layers/dms-layout/app/types/page";

const URL = "/page/layout";
const NEXT_URL = "/page/updated-layout";
const CACHED_URL = "/cached/layout";
const state = new Map<string, Ref>();
const authFetch = vi.fn();
const unmounted = vi.fn();
let app: App;
let host: HTMLDivElement;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function pageLayout(label: string): PageLayout {
  return { components: { form: { options: { label } } }, layout: {} };
}

function siteResponse(label: string, layoutUrl = URL, hasAccess = true) {
  return {
    siteLayout: {
      pages: {
        "/page": {
          id: "page",
          fullId: "page",
          fullSlug: "/page",
          displayName: label,
          layoutUrl,
          hasAccess,
        },
      },
      categories: {},
    },
    siteLayoutTree: undefined,
    quickActions: undefined,
    modules: {},
    isOwner: false,
  };
}

const DirtyField = defineComponent({
  props: { label: String },
  setup(props) {
    const value = ref("");
    onUnmounted(unmounted);
    return () =>
      h("label", [
        props.label,
        h("input", {
          value: value.value,
          onInput: (event: Event) => {
            value.value = (event.target as HTMLInputElement).value;
          },
        }),
      ]);
  },
});

const Page = defineComponent({
  async setup() {
    const { pageLayout: layout } = await usePageLayout();
    return () =>
      h(
        "main",
        Object.entries(layout.value?.components ?? {}).map(([key, component]) =>
          h(DirtyField, { key, ...component.options }),
        ),
      );
  },
});

async function mountDirtyPage() {
  const layout = useSiteLayout();
  layout.siteLayout.value = siteResponse("old menu").siteLayout;
  layout.pageLayouts.value = { [URL]: pageLayout("old field") };
  app = createApp({
    render: () => h(Suspense, null, { default: () => h(Page) }),
  });
  app.mount(host);
  await vi.waitFor(() => expect(host.querySelector("input")).not.toBeNull());
  const input = host.querySelector("input")!;
  input.value = "unsaved draft";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  return { layout, input };
}

function expectDraft(input: HTMLInputElement) {
  expect(host.querySelector("input")).toBe(input);
  expect(input.value).toBe("unsaved draft");
  expect(unmounted).not.toHaveBeenCalled();
}

function siteWithCachedPage(label: string, hasAccess = true) {
  const shared = siteResponse(label, URL, hasAccess);
  return {
    ...shared,
    siteLayout: {
      ...shared.siteLayout,
      pages: {
        ...shared.siteLayout.pages,
        "/cached": {
          ...shared.siteLayout.pages["/page"],
          layoutUrl: CACHED_URL,
          hasAccess: true,
        },
      },
    },
  };
}

async function startRefreshDuringInitialLoad(hasAccess = true) {
  const layout = useSiteLayout();
  layout.siteLayout.value = siteWithCachedPage("old menu").siteLayout;
  layout.pageLayouts.value = { [CACHED_URL]: pageLayout("cached field") };
  const initial = deferred<PageLayout>();
  const cached = deferred<PageLayout>();
  const current = deferred<PageLayout>();
  authFetch
    .mockReturnValueOnce(initial.promise)
    .mockResolvedValueOnce(siteWithCachedPage("new menu", hasAccess))
    .mockReturnValueOnce(cached.promise)
    .mockReturnValueOnce(current.promise);
  app = createApp({
    render: () => h(Suspense, null, { default: () => h(Page) }),
  });
  app.mount(host);
  const refresh = layout.refresh({ fatal: false });
  await vi.waitFor(() => expect(authFetch).toHaveBeenCalledWith(CACHED_URL));
  initial.resolve(pageLayout("initial field"));
  await vi.waitFor(() => expect(host.querySelector("input")).not.toBeNull());
  const input = host.querySelector("input")!;
  input.value = "unsaved draft";
  input.dispatchEvent(new Event("input", { bubbles: true }));
  await nextTick();
  return { layout, refresh, cached, current, input };
}

beforeEach(() => {
  state.clear();
  host = document.createElement("div");
  document.body.append(host);
  const runtime = {};
  const route = reactive({ path: "/page" });
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("useDmsApp", () => runtime);
  vi.stubGlobal("useDmsRoute", () => route);
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useSiteLayout", useSiteLayout);
});

afterEach(() => {
  app?.unmount();
  host.remove();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it.each([URL, NEXT_URL])(
  "keeps a dirty mounted field while revalidating %s, then commits together",
  async (nextUrl) => {
    const { layout, input } = await mountDirtyPage();
    const shared = deferred<ReturnType<typeof siteResponse>>();
    const page = deferred<PageLayout>();
    authFetch
      .mockReturnValueOnce(shared.promise)
      .mockReturnValueOnce(page.promise);
    const refresh = layout.refresh({ fatal: false });
    await nextTick();
    expectDraft(input);
    shared.resolve(siteResponse("new menu", nextUrl));
    await vi.waitFor(() => expect(authFetch).toHaveBeenCalledWith(nextUrl));
    expectDraft(input);
    expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe(
      "old menu",
    );
    page.resolve(pageLayout("new field"));
    await refresh;
    await nextTick();
    expectDraft(input);
    expect(host.textContent).toContain("new field");
    expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe(
      "new menu",
    );
    expect(authFetch).toHaveBeenCalledTimes(2);
  },
);

it.each(["shared", "page"])(
  "preserves the dirty field and old data after a transient %s failure",
  async (phase) => {
    const { layout, input } = await mountDirtyPage();
    const shared = deferred<ReturnType<typeof siteResponse>>();
    const page = deferred<PageLayout>();
    authFetch
      .mockReturnValueOnce(shared.promise)
      .mockReturnValueOnce(page.promise);
    const refresh = layout.refresh({ fatal: false });
    const rejected = expect(refresh).rejects.toThrow("temporary outage");
    if (phase === "page") {
      shared.resolve(siteResponse("new menu"));
      await vi.waitFor(() => expect(authFetch).toHaveBeenCalledWith(URL));
      page.reject(new Error("temporary outage"));
    } else shared.reject(new Error("temporary outage"));
    await rejected;
    await nextTick();
    expectDraft(input);
    expect(host.textContent).toContain("old field");
    expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe(
      "old menu",
    );
  },
);

it("drops the old identity's field and ignores background results after cache replacement", async () => {
  const { layout } = await mountDirtyPage();
  const shared = deferred<ReturnType<typeof siteResponse>>();
  const page = deferred<PageLayout>();
  authFetch
    .mockReturnValueOnce(shared.promise)
    .mockReturnValueOnce(page.promise);
  const refresh = layout.refresh({ fatal: false });
  shared.resolve(siteResponse("old identity refresh"));
  await vi.waitFor(() => expect(authFetch).toHaveBeenCalledWith(URL));
  layout.siteLayout.value = { pages: {}, categories: {} };
  layout.pageLayouts.value = {};
  await nextTick();
  expect(host.querySelector("input")).toBeNull();
  page.resolve(pageLayout("old identity secret"));
  await refresh;
  await nextTick();
  expect(host.querySelector("input")).toBeNull();
  expect(layout.pageLayouts.value).toEqual({});
  expect(layout.siteLayout.value.pages).toEqual({});
});

it("removes a field whose access was revoked without refetching its layout", async () => {
  const { layout } = await mountDirtyPage();
  authFetch.mockResolvedValue(siteResponse("access revoked", URL, false));
  await layout.refresh({ fatal: false });
  await nextTick();
  expect(host.querySelector("input")).toBeNull();
  expect(layout.pageLayouts.value).toEqual({});
  expect(authFetch).toHaveBeenCalledExactlyOnceWith("/dms/sitelayout");
});

it("ignores a background site response after the page cache is replaced", async () => {
  const { layout } = await mountDirtyPage();
  const shared = deferred<ReturnType<typeof siteResponse>>();
  authFetch.mockReturnValueOnce(shared.promise);
  const refresh = layout.refresh({ fatal: false });
  layout.pageLayouts.value = { [URL]: pageLayout("new identity field") };
  await nextTick();
  shared.resolve(siteResponse("old identity menu"));
  await refresh;
  await nextTick();
  expect(host.textContent).toContain("new identity field");
  expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe("old menu");
  expect(authFetch).toHaveBeenCalledExactlyOnceWith("/dms/sitelayout");
});

it("revalidates layouts added during staging without unmounting their dirty fields", async () => {
  const { layout, refresh, cached, current, input } =
    await startRefreshDuringInitialLoad();
  expectDraft(input);
  cached.resolve(pageLayout("updated cached field"));
  await vi.waitFor(() => expect(authFetch).toHaveBeenCalledTimes(4));
  expectDraft(input);
  expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe("old menu");
  current.resolve(pageLayout("updated current field"));
  await refresh;
  await nextTick();
  expectDraft(input);
  expect(host.textContent).toContain("updated current field");
  expect(layout.siteLayout.value?.pages["/page"]?.displayName).toBe("new menu");
  expect(Object.keys(layout.pageLayouts.value).sort()).toEqual(
    [CACHED_URL, URL].sort(),
  );
});

it("does not retain a newly cached layout revoked by the staged site", async () => {
  const { layout, refresh, cached, input } =
    await startRefreshDuringInitialLoad(false);
  expectDraft(input);
  cached.resolve(pageLayout("updated cached field"));
  await refresh;
  await nextTick();
  expect(host.querySelector("input")).toBeNull();
  expect(layout.pageLayouts.value[URL]).toBeUndefined();
  expect(authFetch).toHaveBeenCalledTimes(3);
});
