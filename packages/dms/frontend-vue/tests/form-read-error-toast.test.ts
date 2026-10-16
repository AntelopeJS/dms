import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { useForm } from "../layers/dms-ui/app/composables/form/useForm";

// A form whose record read failed in a server render added a toast there: the
// page's HTML showed it, the browser's toasts did not hold it, so hydration
// mismatched, and Nuxt UI's state, one record for the server process up to
// renderer 0.6.0, showed it to every later visitor. The form shows the failure
// itself (FormLoadError); only a read in the browser adds a toast.

const authFetch = vi.fn();
const toastAdd = vi.fn();
let scope: EffectScope;

function readRecord() {
  const form = scope.run(() =>
    useForm({
      componentId: "form-1",
      pageId: "page-1",
      fields: [],
      fetchUrl: "/api/plans/get?id=pro",
    } as never),
  )!;
  return form.fetchData();
}

beforeEach(() => {
  scope = effectScope();
  authFetch.mockRejectedValue(
    Object.assign(new Error("Forbidden"), { data: "forbidden" }),
  );
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal("Color", { error: "error", success: "success", info: "info" });
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "Content-Language");
  vi.stubGlobal("useToast", () => ({ add: toastAdd }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useEventedAction", () => ({ execute: vi.fn() }));
  vi.stubGlobal(
    "useWatch",
    (_actions: unknown, _id: unknown, initial: Record<string, unknown>) => ({
      isLoading: ref(false),
      state: ref({ ...initial }),
    }),
  );
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe("a form whose record read fails", () => {
  it("adds no toast in a server render, and still fails the read", async () => {
    vi.stubEnv("SSR", true);
    await expect(readRecord()).rejects.toThrow("Forbidden");
    expect(toastAdd).not.toHaveBeenCalled();
  });

  it("adds a toast in the browser", async () => {
    vi.stubEnv("SSR", false);
    await expect(readRecord()).rejects.toThrow("Forbidden");
    expect(toastAdd).toHaveBeenCalledOnce();
    expect(toastAdd.mock.calls[0][0]).toMatchObject({
      title: "$dms.form.fetch_error_title",
      description: "forbidden",
    });
  });
});
