// @vitest-environment jsdom
import { ref, type Ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// What a realtime menu invalidation does: a partial reload of the page on
// screen through Inertia, which replaces the site layout every visit carries
// over (a once prop) along with the state.
const reload = vi.hoisted(() => vi.fn());
vi.mock("@inertiajs/vue3", () => ({ router: { reload } }));

const { useSiteLayout } = await import(
  "../layers/dms-layout/app/composables/page/useSiteLayout"
);

type ReloadOptions = {
  only: string[];
  onHttpException: (response: { status: number }) => boolean | void;
  onNetworkError: (error: Error) => boolean | void;
  onFinish: () => void;
};

const state = new Map<string, Ref>();

beforeEach(() => {
  state.clear();
  const app = {};
  vi.stubGlobal("useDmsApp", () => app);
  vi.stubGlobal("useDmsState", (key: string, initial: () => unknown) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: vi.fn() }));
  window.history.replaceState(null, "", "/projects");
});

afterEach(() => {
  vi.unstubAllGlobals();
  reload.mockReset();
});

describe("useSiteLayout resync", () => {
  it("reloads the site layout and the page through Inertia", async () => {
    reload.mockImplementation((options: ReloadOptions) => options.onFinish());
    await useSiteLayout().resync();
    expect(reload).toHaveBeenCalledTimes(1);
    expect(reload.mock.calls[0]![0].only).toEqual(["shared", "page"]);
  });

  it("rejects a failed reload and keeps the page on screen", async () => {
    let swapsPage: boolean | void = true;
    reload.mockImplementation((options: ReloadOptions) => {
      swapsPage = options.onHttpException({ status: 502 });
      options.onFinish();
    });
    await expect(useSiteLayout().resync()).rejects.toThrow("502");
    expect(swapsPage).toBe(false);

    reload.mockImplementation((options: ReloadOptions) => {
      swapsPage = options.onNetworkError(new Error("offline"));
      options.onFinish();
    });
    await expect(useSiteLayout().resync()).rejects.toThrow("offline");
    expect(swapsPage).toBe(false);
  });

  it("reloads the page a navigation opened while the reload was in flight", async () => {
    reload.mockImplementationOnce((options: ReloadOptions) => {
      // Inertia drops an async answer for a page the user has left.
      window.history.replaceState(null, "", "/tasks");
      options.onFinish();
    });
    reload.mockImplementation((options: ReloadOptions) => options.onFinish());
    await useSiteLayout().resync();
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
