import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { HttpMethod } from "../layers/dms-core/app/types/http";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { formSubmitEvent } from "./helpers/form-submit-event";
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
      },
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
  vi.stubGlobal("isString", isString);
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

  vi.stubGlobal("useEventedAction", useEventedAction);
  vi.stubGlobal(
    "useWatch",
    (
      ...[_actions, _id, initial]: Parameters<
        typeof import("../layers/dms-core/app/composables/watch/useWatch").useWatch
      >
    ) => ({
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
  it("holds nothing unsaved once the success event goes out", async () => {
    const steps: string[] = [];
    const form = setupForm(() => steps.push("saved"));
    let savedValues: typeof form.initialValues.value | undefined;
    sendComponentEvent.mockImplementation((event: string) => {
      if (event !== FormEvents.SUBMIT_SUCCESS) return;
      steps.push("success");
      savedValues = { ...form.initialValues.value };
    });
    form.initialValues.value = { roles: ["auditor"] };
    const edited = { roles: ["auditor", "finance"] };
    Object.assign(form.state.value, edited);

    await form.onSubmit(formSubmitEvent(edited));

    expect(steps.slice(0, 2)).toEqual(["saved", "success"]);
    expect(savedValues).toEqual(edited);
    expect(form.submitSucceeded.value).toBe(true);
  });

  it("announces no success, and saves nothing, when the submit is refused", async () => {
    authFetch.mockRejectedValue({ statusCode: 400, data: "refused" });
    const onSaved = vi.fn();
    const form = setupForm(onSaved);
    form.initialValues.value = { roles: ["auditor"] };
    Object.assign(form.state.value, { roles: [] });

    await form.onSubmit(formSubmitEvent({ roles: [] }));

    expect(onSaved).not.toHaveBeenCalled();
    expect(sendComponentEvent).not.toHaveBeenCalledWith(
      FormEvents.SUBMIT_SUCCESS,
      expect.anything(),
      expect.anything(),
    );
    expect(form.initialValues.value).toEqual({ roles: ["auditor"] });
  });
});
