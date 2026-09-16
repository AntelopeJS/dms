import { effectScope, onScopeDispose, ref } from "vue";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useFileReadUrls } from "../layers/dms-ui/app/composables/useFileReadUrls";

const RESOURCE_KEY = "localized/private.png";
const START_TIME = new Date("2026-09-14T12:00:00Z");
const URL_TTL_MS = 60000;

const authFetch = vi.fn();

describe("file read URLs", () => {
  beforeEach(() => {
    vi.stubEnv("SSR", false);
    vi.useFakeTimers();
    vi.setSystemTime(START_TIME);
    vi.stubGlobal("ref", ref);
    vi.stubGlobal("onScopeDispose", onScopeDispose);
    vi.stubGlobal("inject", () => "*");
    vi.stubGlobal("FORM_CONTENT_LANGUAGE_KEY", Symbol());
    vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "x-content-language");
    vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.resetAllMocks();
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
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls("private"))!;
    await urls.resolve(RESOURCE_KEY);

    expect(authFetch).toHaveBeenCalledWith("/api/files/metadata", {
      query: { resourceKey: RESOURCE_KEY, storage: "private" },
      headers: { "x-content-language": "*" },
    });
    scope.stop();
  });

  it("retries the first failed lookup while the component stays mounted", async () => {
    authFetch
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ url: "https://example.test/recovered" });
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY);
    expect(urls.getUrl(RESOURCE_KEY)).toBeUndefined();
    await vi.advanceTimersByTimeAsync(5000);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/recovered");
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
    await pending;
    await vi.advanceTimersByTimeAsync(URL_TTL_MS * 2);
    expect(authFetch).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("resolves metadata during SSR without scheduling browser refresh timers", async () => {
    vi.stubEnv("SSR", true);
    authFetch.mockResolvedValue({
      url: "https://example.test/ssr",
      expiresAt: Date.now() + URL_TTL_MS,
    });
    const scope = effectScope();
    const urls = scope.run(() => useFileReadUrls())!;
    await urls.resolve(RESOURCE_KEY);
    expect(urls.getUrl(RESOURCE_KEY)).toBe("https://example.test/ssr");
    expect(vi.getTimerCount()).toBe(0);
    scope.stop();
  });
});
