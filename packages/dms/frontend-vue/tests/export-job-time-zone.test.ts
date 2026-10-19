/**
 * An export job names the browser's time zone when it starts, so a readable
 * export writes its dates in the reader's zone when they saved none. It goes
 * in the URL: the frontend server relays a fixed set of request headers to the
 * backend, and an `x-time-zone` header never reached it.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { browserTimeZone } from "../layers/dms-core/app/utils/regional";
import { useExportJob } from "../layers/dms-ui/app/composables/useExportJob";

const authFetch = vi.fn();

beforeEach(() => {
  authFetch.mockReset();
  // The job stops at its start: only the start request is looked at.
  authFetch.mockRejectedValue(new Error("stopped"));
  vi.stubGlobal("useToast", () => ({
    add: vi.fn(() => ({ id: "toast" })),
    update: vi.fn(),
    remove: vi.fn(),
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (text: string) => text,
  }));
  vi.stubGlobal("useAuthFetch", () => ({
    $authFetch: Object.assign(authFetch, { raw: vi.fn() }),
  }));
  vi.stubGlobal("browserTimeZone", browserTimeZone);
  vi.stubGlobal("Color", { info: "info", error: "error", success: "success" });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("useExportJob — the reader's time zone", () => {
  it("sends the browser's time zone in the start request's query", async () => {
    const { runJob } = useExportJob();

    await runJob({
      startUrl: "/api/deals/export/start",
      startMethod: "GET",
      startQuery: { sortKey: "title" },
    });

    expect(authFetch).toHaveBeenCalledTimes(1);
    const [url, init] = authFetch.mock.calls[0]!;
    expect(url).toBe("/api/deals/export/start");
    expect(init).toMatchObject({
      method: "GET",
      query: {
        sortKey: "title",
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
    // A header the frontend server would drop on its way to the backend.
    expect(init).not.toHaveProperty("headers");
  });

  it("adds it to a POST start that names no query", async () => {
    const { runJob } = useExportJob();

    await runJob({
      startUrl: "/api/reports/export",
      startBody: { period: "month" },
    });

    const [, init] = authFetch.mock.calls[0]!;
    expect(init).toMatchObject({
      method: "POST",
      body: { period: "month" },
      query: {
        timeZone: new Intl.DateTimeFormat().resolvedOptions().timeZone,
      },
    });
  });
});
