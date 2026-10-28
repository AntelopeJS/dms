import { HttpMethod } from "../layers/dms-core/app/types/http";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { computed, effectScope, ref, watch, type EffectScope } from "vue";
import { useForm } from "../layers/dms-ui/app/composables/form/useForm";
import { isString } from "../layers/dms-core/app/utils/type-check";
import { formSubmitEvent } from "./helpers/form-submit-event";

const authFetch = vi.fn();
const addToast = vi.fn();
let scope: EffectScope;

const FIELDS = [
  { id: "title", label: "Title", component: { componentName: "DmsInputText" } },
  {
    id: "channel",
    label: "Channel",
    defaultValue: "general",
    component: { componentName: "DmsInputText" },
  },
];

function setupForm(kind?: "record" | "action") {
  return scope.run(() =>
    useForm({
      componentId: "form-1",
      pageId: "page-1",
      fields: FIELDS,
      submitUrl: "/api/messages/send",
      kind,
    }),
  )!;
}

/** Fills the form as the user would, from the values it opened with. */
async function fillAndSubmit(form: ReturnType<typeof setupForm>) {
  form.initialValues.value = { channel: "general" };
  Object.assign(form.state.value, { title: "Hello", channel: "random" });
  await form.onSubmit(formSubmitEvent({ title: "Hello", channel: "random" }));
}

beforeEach(() => {
  scope = effectScope();
  authFetch.mockResolvedValue({ success: true });
  vi.stubGlobal("computed", computed);
  vi.stubGlobal("ref", ref);
  vi.stubGlobal("watch", watch);
  vi.stubGlobal("isString", isString);
  vi.stubGlobal("HttpMethod", HttpMethod);
  vi.stubGlobal("Color", { error: "error", success: "success", info: "info" });
  vi.stubGlobal("CONTENT_LANGUAGE_HEADER", "Content-Language");
  vi.stubGlobal("useToast", () => ({ add: addToast }));
  vi.stubGlobal("useAuthFetch", () => ({ $authFetch: authFetch }));
  vi.stubGlobal("useDataTypes", () => ({ getDataType: () => undefined }));
  vi.stubGlobal("useTranslation", () => ({
    processI18n: (key: string) => key,
    processApiMessage: (message: string) => message,
  }));
  vi.stubGlobal("useI18n", () => ({ t: (key: string) => key }));
  vi.stubGlobal("useDmsRoute", () => ({ query: {} }));
  vi.stubGlobal("useComponentEvent", () => ({ sendComponentEvent: vi.fn() }));
  vi.stubGlobal("useEventedAction", () => ({
    execute: <Result>(action: () => Promise<Result>) => action(),
  }));
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

describe("DMS form reset after a submit", () => {
  it("empties an action form once sent, back to the values it opened with", async () => {
    const form = setupForm("action");
    await fillAndSubmit(form);
    expect(addToast).toHaveBeenCalledWith(
      expect.objectContaining({ color: "success" }),
    );
    expect(form.state.value.title).toBeUndefined();
    expect(form.state.value.channel).toBe("general");
    expect(form.initialValues.value).toEqual({ channel: "general" });
  });

  it("keeps a record's saved values as the new starting point", async () => {
    const form = setupForm();
    await fillAndSubmit(form);
    expect(form.state.value.title).toBe("Hello");
    expect(form.initialValues.value).toEqual({
      title: "Hello",
      channel: "random",
    });
  });

  it("keeps what the user typed when the submit fails", async () => {
    authFetch.mockRejectedValue({ statusCode: 500, data: "boom" });
    const form = setupForm("action");
    await fillAndSubmit(form);
    expect(form.state.value.title).toBe("Hello");
  });
});
