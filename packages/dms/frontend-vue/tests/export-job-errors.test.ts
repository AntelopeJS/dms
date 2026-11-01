/** @vitest-environment jsdom */
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useExportJob } from "../layers/dms-ui/app/composables/useExportJob";
import { apiErrorText } from "../layers/dms-core/app/composables/useFieldErrors";
import { useReadOnlyRefusal } from "../layers/dms-core/app/composables/useReadOnlyRefusal";
import {
  installReadOnlyRefusal,
  readOnlyFailure,
} from "./helpers/read-only-refusal";

const add = vi.fn((payload) => ({ ...payload, id: payload.id ?? "export" }));
const remove = vi.fn();
const authFetch = vi.fn();

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("useToast", () => ({ add, remove, update: vi.fn() }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useTranslation", () => ({
    processApiMessage: (key: string) => key,
  }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("apiErrorText", apiErrorText);
  vi.stubGlobal("Color", { info: "info", error: "error", success: "success" });
  installReadOnlyRefusal();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

it.each([true, false])(
  "removes progress and presents only the owning refusal notice, marked %s",
  async (marked) => {
    const failure = marked
      ? readOnlyFailure()
      : {
          response: new Response(null, { status: 403 }),
          data: "Permission denied",
        };
    const consume = useReadOnlyRefusal();
    authFetch.mockImplementationOnce(async () => {
      consume(failure);
      throw failure;
    });
    await useExportJob().runJob({ startUrl: "/export/start" });
    expect(remove).toHaveBeenCalledWith("export");
    expect(add).toHaveBeenCalledTimes(2);
    expect(add.mock.calls[1]?.[0]).toMatchObject(
      marked
        ? { id: "dms-read-only", color: "warning" }
        : { color: "error", description: "Permission denied" },
    );
  },
);

it.each([
  [
    JSON.stringify({
      status: 500,
      body: "Failed to upload export: HTTP 403",
      contentType: "text/plain",
      errorLogged: false,
    }),
    "Failed to upload export: HTTP 403",
  ],
  [
    JSON.stringify({ status: 500, body: { message: "Export unavailable" } }),
    "Export unavailable",
  ],
  [
    JSON.stringify({
      status: 500,
      body: JSON.stringify({ message: "Export unavailable" }),
    }),
    "Export unavailable",
  ],
  [
    JSON.stringify({ status: 500, body: { debug: "private" } }),
    "dms.form.error_title",
  ],
  ["Export failed", "Export failed"],
])(
  "shows readable failed-job text instead of serialized JSON %s",
  async (error, description) => {
    authFetch
      .mockResolvedValueOnce({ jobId: "job" })
      .mockResolvedValueOnce({ status: "failed", error });
    const job = useExportJob().runJob({ startUrl: "/export/start" });
    await vi.advanceTimersByTimeAsync(400);
    await job;
    expect(add.mock.calls[1]?.[0]).toMatchObject({
      color: "error",
      description,
    });
    expect(add.mock.calls[1]?.[0].actions[0].label).toBe(
      "dms.table.export.retry",
    );
  },
);
