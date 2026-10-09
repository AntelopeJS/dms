import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { useForm } from "../layers/dms-ui/app/composables/form/useForm";
import { useEventedAction } from "../layers/dms-core/app/composables/useEventedAction";
import { FormEvents } from "../layers/dms-ui/app/composables/form/types/events";

const authFetch = vi.fn();
const sendComponentEvent = vi.fn();
let scope: EffectScope;

const FIELDS = [
  { id: "roles", label: "Roles", component: { componentName: "DmsInputText" } },
];

function setupForm(onSaved: () => void) {
  return scope.run(() =>
    useForm(
      {
        componentId: "form-1",
        pageId: "page-1",
        fields: FIELDS,
        fetchUrl: "/api/invites/get?id=invite-1",
        submitUrl: "/api/invites/edit?id=invite-1",
      } as never,
      { onSaved },
    ),
  )!;
}

beforeEach(() => {
  scope = effectScope();
  authFetch.mockResolvedValue({ success: true });
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("isString", (value: unknown) => typeof value === "string");
  vi.stubGlobal("Color", { error: "error", success: "success", info: "info" });
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "Content-Language");
  vi.stubGlobal("useToast", () => ({ add: vi.fn() }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent }));
  // The real one: it sends the submit events the watch rules react to.
  vi.stubGlobal("useEventedAction", useEventedAction);
  vi.stubGlobal(
    "useWatch",
    (_actions: unknown, _id: unknown, initial: Record<string, unknown>) => ({
      isLoading: ref(false),
      state: ref({ ...initial }),
    }),
  );
  vi.stubGlobal("navigateDms", vi.fn());
});

afterEach(() => {
  scope.stop();
  vi.unstubAllGlobals();
  vi.resetAllMocks();
});

describe("DMS form announcing a successful submit", () => {
  // A form page goes back to its list on the success event: announced while
  // the form still held its changes, the leave guard asked to discard them
  // although they were saved, and the page stayed open behind its dialog.
  it("holds nothing unsaved once the success event goes out", async () => {
    const steps: string[] = [];
    const form = setupForm(() => steps.push("saved"));
    let savedValues: unknown;
    sendComponentEvent.mockImplementation((event: string) => {
      if (event !== FormEvents.SUBMIT_SUCCESS) return;
      steps.push("success");
      savedValues = { ...form.initialValues.value };
    });
    form.initialValues.value = { roles: ["auditor"] };
    const edited = { roles: ["auditor", "finance"] };
    Object.assign(form.state.value, edited);

    await form.onSubmit({ data: edited } as never);

    expect(steps).toEqual(["saved", "success"]);
    expect(savedValues).toEqual(edited);
    expect(form.submitSucceeded.value).toBe(true);
  });

  it("announces no success, and saves nothing, when the submit is refused", async () => {
    authFetch.mockRejectedValue({ statusCode: 400, data: "refused" });
    const onSaved = vi.fn();
    const form = setupForm(onSaved);
    form.initialValues.value = { roles: ["auditor"] };
    Object.assign(form.state.value, { roles: [] });

    await form.onSubmit({ data: { roles: [] } } as never);

    expect(onSaved).not.toHaveBeenCalled();
    expect(sendComponentEvent).not.toHaveBeenCalledWith(
      FormEvents.SUBMIT_SUCCESS,
      expect.anything(),
      expect.anything(),
    );
    expect(form.initialValues.value).toEqual({ roles: ["auditor"] });
  });
});
