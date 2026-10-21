// @vitest-environment jsdom
/**
 * `$authFetch` names the browser's time zone on every request it sends from
 * the browser, so the backend can write dates in the reader's zone (a readable
 * table export does). The frontend server relays it (`x-time-zone`).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ref } from "vue";
import { useAuthFetch } from "../layers/dms-core/app/composables/auth/useAuthFetch";

type OnRequest = (context: { options: { headers: Headers } }) => void;

let onRequest: OnRequest | undefined;

beforeEach(() => {
  onRequest = undefined;
  const create = vi.fn((options: { onRequest: OnRequest }) => {
    onRequest = options.onRequest;
    return Object.assign(vi.fn(), { raw: vi.fn() });
  });
  vi.stubGlobal("$fetch", { create });
  vi.stubGlobal("useDmsUserSession", () => ({ loggedIn: ref(true) }));
  vi.stubGlobal("useSessionRecovery", () => ({}));
  vi.stubGlobal("useDmsRuntimeConfig", () => ({
    public: { dms: { baseURL: "/api" } },
  }));
  vi.stubGlobal("useDmsApp", () => ({ $i18n: { locale: ref("fr") } }));
  vi.stubGlobal("useDmsState", () => ref(undefined));
  vi.stubGlobal("browserTimeZone", () => "Europe/Brussels");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function sentHeaders(initial?: HeadersInit): Headers {
  useAuthFetch();
  const headers = new Headers(initial);
  onRequest!({ options: { headers } });
  return headers;
}

describe("useAuthFetch — the browser's time zone", () => {
  it("sends the browser's time zone with the interface language", () => {
    const headers = sentHeaders();
    expect(headers.get("x-time-zone")).toBe("Europe/Brussels");
    expect(headers.get("x-content-language")).toBe("fr");
  });

  it("keeps a time zone the caller sets", () => {
    const headers = sentHeaders({ "x-time-zone": "America/New_York" });
    expect(headers.get("x-time-zone")).toBe("America/New_York");
  });
});
