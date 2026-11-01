import { ref, type Ref } from "vue";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useSiteLayout } from "../layers/dms-core/app/composables/page/useSiteLayout";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";
import {
  readOnlyFailure,
  unmarkedForbiddenFailure,
} from "./helpers/read-only-refusal";

const state = new Map<string, Ref>();
const authFetch = vi.fn();

beforeEach(() => {
  state.clear();
  const app = {};
  vi.stubGlobal("useDmsApp", () => app);
  vi.stubGlobal("useDmsState", <T>(key: string, initial: () => T) => {
    if (!state.has(key)) state.set(key, ref(initial()));
    return state.get(key);
  });
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it("deduplicates consumers but never writes an old account response into a new cache", async () => {
  let finish!: (value: { components: { secret: object } }) => void;
  authFetch.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const first = useSiteLayout();
  const second = useSiteLayout();
  const oldRequest = first.loadPageLayout("/layout");
  const joined = second.loadPageLayout("/layout");
  expect(authFetch).toHaveBeenCalledTimes(1);

  state.get("dms-pageLayouts")!.value = {};
  authFetch.mockResolvedValueOnce({ components: { fresh: {} } });
  await second.loadPageLayout("/layout");
  finish({ components: { secret: {} } });
  await Promise.all([oldRequest, joined]);
  expect(authFetch).toHaveBeenCalledTimes(2);
  expect(first.pageLayouts.value).toEqual({
    "/layout": { components: { fresh: {} } },
  });
});

it("does not overwrite an Inertia site payload with a pre-navigation fetch", async () => {
  let finish!: (value: {
    siteLayout: { pages: { secret: object }; categories: object };
  }) => void;
  authFetch.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const layout = useSiteLayout();
  const request = layout.loadSiteLayout();
  state.get("dms-siteLayout")!.value = { pages: { fresh: {} }, categories: {} };
  finish({ siteLayout: { pages: { secret: {} }, categories: {} } });
  await request;
  expect(layout.siteLayout.value).toEqual({
    pages: { fresh: {} },
    categories: {},
  });
});

it("does not show a stale request error after successful Inertia navigation", async () => {
  let fail!: (error: Error) => void;
  authFetch.mockReturnValueOnce(
    new Promise((_, reject) => {
      fail = reject;
    }),
  );
  const showDmsError = vi.fn();
  vi.stubGlobal("showDmsError", showDmsError);
  const layout = useSiteLayout();
  const request = layout.loadSiteLayout();
  state.get("dms-siteLayout")!.value = { pages: { fresh: {} }, categories: {} };
  fail(new Error("old account request"));
  await expect(request).rejects.toThrow("old account request");
  expect(showDmsError).not.toHaveBeenCalled();
  expect(layout.loadingError.value).toBeNull();
});

it.each([true, false])(
  "keeps site-layout rejection and cleanup without a second error page, marked %s",
  async (marked) => {
    const add = vi.fn();
    const showDmsError = vi.fn();
    vi.stubGlobal("useToast", () => ({ add }));
    vi.stubGlobal("showDmsError", showDmsError);
    vi.stubGlobal("getAppTranslation", () => ({
      processApiMessage: (key: string) => key,
    }));
    vi.stubGlobal("useReadOnlyRefusal", useReadOnlyRefusal);
    const failure = marked ? readOnlyFailure() : unmarkedForbiddenFailure();
    authFetch.mockRejectedValueOnce(failure);
    const layout = useSiteLayout();
    await expect(layout.loadSiteLayout()).rejects.toBe(failure);
    expect(layout.isLoading.value).toBe(false);
    expect(layout.loadingError.value).toBe(marked ? null : "Forbidden");
    expect(showDmsError).toHaveBeenCalledTimes(marked ? 0 : 1);
    expect(add).toHaveBeenCalledTimes(marked ? 1 : 0);
  },
);
