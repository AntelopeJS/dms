/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExportJob } from "../layers/dms-ui/app/composables/useExportJob";
import { requestRefusal } from "./helpers/api-error-runtime";

const add = vi.fn(() => ({ id: "export" }));
const update = vi.fn();
const remove = vi.fn();
const authFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubEnv("SSR", false);
  vi.stubGlobal("useToast", () => ({ add, remove, update }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("Color", { info: "info", success: "success" });
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it.each([
  [
    JSON.stringify({ status: 500, body: "Failed to upload export: HTTP 403" }),
    "dms.table.export.error_title",
  ],
  [
    JSON.stringify({ status: 500, body: { message: "error.read_only_demo" } }),
    "error.read_only_demo",
  ],
  [
    JSON.stringify({ status: 500, body: { debug: "private" } }),
    "dms.table.export.error_title",
  ],
  ['{"status":500,broken', "dms.table.export.error_title"],
])(
  "replaces progress with a resolved stored failure, never the envelope %s",
  async (error, title) => {
    authFetch
      .mockResolvedValueOnce({ jobId: "job" })
      .mockResolvedValueOnce({ status: "failed", error });
    const job = useExportJob().runJob({ startUrl: "/export/start" });
    await vi.advanceTimersByTimeAsync(400);
    await job;
    expect(add).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledExactlyOnceWith(
      "export",
      expect.objectContaining({
        title,
        color: "error",
        description: undefined,
      }),
    );
    const [id, payload] = update.mock.calls[0]!;
    expect(id).toBe("export");
    expect(payload.actions[0].label).toBe("dms.table.export.retry");
    authFetch.mockRejectedValueOnce(requestRefusal());
    payload.actions[0].onClick();
    await vi.advanceTimersByTimeAsync(0);
    expect(authFetch).toHaveBeenCalledTimes(3);
    expect(remove).toHaveBeenCalledWith("export");
    expect(update).toHaveBeenLastCalledWith(
      "export",
      expect.objectContaining({
        title: "error.read_only_demo",
        color: "warning",
      }),
    );
  },
);

it("removes progress when starting the export is cancelled", async () => {
  authFetch.mockRejectedValueOnce(new DOMException("Aborted", "AbortError"));
  await useExportJob().runJob({ startUrl: "/export/start" });
  expect(add).toHaveBeenCalledOnce();
  expect(remove).toHaveBeenCalledWith("export");
  expect(update).not.toHaveBeenCalled();
});
