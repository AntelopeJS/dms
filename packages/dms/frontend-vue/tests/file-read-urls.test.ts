/** @vitest-environment jsdom */
/**
 * Stored files' read URLs through the runtime's real async data: a key
 * resolved in a component's setup is read with the page (the server waits for
 * it and hands it over), every component showing a file shares its read, and
 * in the browser the URL is read again before it expires and a failure that
 * may heal is retried.
 */
import {
  computed,
  defineComponent,
  effectScope,
  h,
  inject,
  nextTick,
  onScopeDispose,
  ref,
  shallowReactive,
  watch,
  type App,
} from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  browserRuntime,
  hydrate,
  mountInBrowser,
  serverRender,
  stubApiData,
} from "./helpers/api-data-runtime";
import { useFileReadUrls } from "../layers/dms-ui/app/composables/useFileReadUrls";
import { FORM_CONTENT_LANGUAGE_KEY } from "../layers/dms-ui/app/composables/form/types/content-language";

const RESOURCE_KEY = "localized/private.png";
const START_TIME = new Date("2026-09-14T12:00:00Z");
const URL_TTL_MS = 60000;

const authFetch = vi.fn();
const mounted: App[] = [];

/** An avatar as the identity cell draws it: resolved from an immediate watcher. */
const Avatar = defineComponent({
  props: { fileKey: { type: String, required: true } },
  setup(props) {
    const { getUrl, resolve } = useFileReadUrls();
    watch(
      () => props.fileKey,
      (key) => void resolve(key),
      { immediate: true },
    );
    return () => h("img", { src: getUrl(props.fileKey) ?? "" });
  },
});

const metadataCalls = () =>
  authFetch.mock.calls.filter(([url]) => url === "/api/files/metadata");

beforeEach(() => {
  vi.stubEnv("SSR", false);
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("onScopeDispose", onScopeDispose);
  vi.stubGlobal("shallowReactive", shallowReactive);
  vi.stubGlobal("inject", inject);
  stubApiData(authFetch);
});

afterEach(() => {
  mounted.splice(0).forEach((app) => app.unmount());
  vi.unstubAllEnvs();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("file read URLs in a server render", () => {
  it("renders the URL a setup resolves, and the browser hydrates without asking again", async () => {
    authFetch.mockResolvedValue({
      url: "https://example.test/avatar",
      expiresAt: Date.now() + URL_TTL_MS,
    });
    const Row = defineComponent({
      setup: () => () =>
        h("div", [
          h(Avatar, { fileKey: RESOURCE_KEY }),
          h(Avatar, { fileKey: RESOURCE_KEY }),
        ]),
    });

    vi.stubEnv("SSR", true);
    const { html, payload } = await serverRender(Row);
    vi.stubEnv("SSR", false);
    expect(html).toBe(
      '<div><img src="https://example.test/avatar"><img src="https://example.test/avatar"></div>',
    );

    expect(metadataCalls()).toHaveLength(1);

    authFetch.mockClear();
    const { app, container } = hydrate(Row, html, payload);
    mounted.push(app);
    await nextTick();
    await new Promise((done) => setTimeout(done, 0));
    expect(authFetch).not.toHaveBeenCalled();
    expect(container.innerHTML).toBe(html);
  });
});

describe("file read URLs in the browser", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
    browserRuntime();
  });

  it("preserves expiry and refreshes a visible URL before it expires", async () => {
    authFetch
      .mockResolvedValueOnce({
        url: "https://example.test/first",
        expiresAt: Date.now() + URL_TTL_MS,
      })
      .mockResolvedValueOnce({
        url: "https://example.test/refreshed",
        expiresAt: Date.now() + URL_TTL_MS * 2,
      });

    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/first");

    await vi.advanceTimersByTimeAsync(URL_TTL_MS - 5000);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/refreshed");
    expect(authFetch).toHaveBeenCalledTimes(2);
    scope.stop();
  });

  it("retries a transient refresh failure without exposing an expired URL", async () => {
    authFetch
      .mockResolvedValueOnce({
        url: "https://example.test/first",
        expiresAt: Date.now() + URL_TTL_MS,
      })
      .mockRejectedValueOnce(new Error("temporary"))
      .mockResolvedValueOnce({
        url: "https://example.test/recovered",
        expiresAt: Date.now() + URL_TTL_MS,
      });

    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY);
    await vi.advanceTimersByTimeAsync(URL_TTL_MS - 5000);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/first");
    await vi.advanceTimersByTimeAsync(2500);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/recovered");
    scope.stop();
  });

  it("uses the full localized form language for metadata authorization", async () => {
    authFetch.mockResolvedValue({ url: "https://example.test/file" });
    const Field = defineComponent({
      setup() {
        const { getUrl, resolve } = useFileReadUrls("private");
        void resolve(RESOURCE_KEY);
        return () => h("img", { src: getUrl(RESOURCE_KEY) ?? "" });
      },
    });
    const { app } = mountInBrowser(Field, (application) =>
      application.provide(FORM_CONTENT_LANGUAGE_KEY, "*"),
    );
    mounted.push(app);
    await vi.advanceTimersByTimeAsync(0);
    expect(authFetch).toHaveBeenCalledWith("/api/files/metadata", {
      query: { resourceKey: RESOURCE_KEY, storage: "private" },
      headers: { "x-content-language": "*" },
      signal: expect.any(AbortSignal),
    });
  });

  it("retries the first failed lookup while the component stays mounted", async () => {
    authFetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ url: "https://example.test/recovered" });
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY).catch(() => {});
    expect(urls.getUrl(RESOURCE_KEY)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/recovered");
    scope.stop();
  });

  it("does not retry a file the server refuses", async () => {
    authFetch.mockRejectedValue(
      Object.assign(new Error("Not found"), { statusCode: 404 }),
    );
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY).catch(() => {});
    await vi.advanceTimersByTimeAsync(60000);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(urls.getUrl(RESOURCE_KEY)).toBeUndefined();
    scope.stop();
  });

  it("does not restart refresh timers when an in-flight lookup finishes after disposal", async () => {
    let finish!: (value: unknown) => void;
    authFetch.mockReturnValue(
      new Promise((resolve) => {
        finish = resolve;
      }),
    );
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    const pending = urls.resolve(RESOURCE_KEY);
    scope.stop();
    finish({
      url: "https://example.test/late",
      expiresAt: Date.now() + URL_TTL_MS,
    });
    await pending.catch(() => {});
    await vi.advanceTimersByTimeAsync(URL_TTL_MS * 2);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("reads a key resolved after the setup, as an upload's", async () => {
    authFetch.mockResolvedValue({ url: "https://example.test/uploaded" });
    const key = ref<string | null>(null);
    const Uploaded = defineComponent({
      setup() {
        const { getUrl, resolve } = useFileReadUrls();
        watch(key, (value) => value && void resolve(value));
        return () => h("img", { src: key.value ? getUrl(key.value) : "" });
      },
    });
    const { app, container } = mountInBrowser(Uploaded);
    mounted.push(app);
    key.value = "uploads/new.png";
    await vi.advanceTimersByTimeAsync(0);
    expect(container.querySelector("img")?.getAttribute("src")).toBe(
      "https://example.test/uploaded",
    );
  });
});
